// ============================================================================
// modelDefinition.ts — TensorFlow.js model architectures
// Defines Dense, LSTM, and lightweight transformer-inspired models via the
// Layers API. All models are compiled with configurable optimizers/losses.
// ============================================================================

import * as tf from '@tensorflow/tfjs';
import type { Architecture, Hyperparams } from './types';

// Build a feed-forward dense network for tabular features.
// Input: [numFeatures] → Dense layers + dropout → softmax/sigmoid output.
export function buildDenseModel(hp: Hyperparams, numFeatures: number): tf.LayersModel {
  const input = tf.input({ shape: [numFeatures], name: 'features' });
  let x = input;
  for (let i = 0; i < hp.hiddenUnits.length; i++) {
    x = tf.layers.dense({ units: hp.hiddenUnits[i], activation: 'relu', name: `dense_${i}` }).apply(x) as tf.SymbolicTensor;
    if (hp.dropout > 0) {
      x = tf.layers.dropout({ rate: hp.dropout, name: `dropout_${i}` }).apply(x) as tf.SymbolicTensor;
    }
  }
  const output = hp.taskType === 'classification'
    ? tf.layers.dense({ units: hp.numClasses, activation: 'softmax', name: 'output' }).apply(x) as tf.SymbolicTensor
    : tf.layers.dense({ units: 1, activation: 'linear', name: 'output' }).apply(x) as tf.SymbolicTensor;

  const model = tf.model({ inputs: input, outputs: output, name: 'dense_model' });
  compileModel(model, hp);
  return model;
}

// Build an LSTM model for sequential/time-series data.
// Input: [sequenceLength, numFeatures] → LSTM layers → Dense → output.
export function buildLSTMModel(hp: Hyperparams, numFeatures: number): tf.LayersModel {
  const input = tf.input({ shape: [hp.sequenceLength, numFeatures], name: 'sequence' });
  let x = input;
  // First LSTM returns sequences for stacking; last returns only final output.
  for (let i = 0; i < hp.hiddenUnits.length; i++) {
    const returnSeq = i < hp.hiddenUnits.length - 1;
    x = tf.layers.lstm({
      units: hp.hiddenUnits[i],
      returnSequences: returnSeq,
      name: `lstm_${i}`,
    }).apply(x) as tf.SymbolicTensor;
    if (hp.dropout > 0) {
      x = tf.layers.dropout({ rate: hp.dropout, name: `dropout_${i}` }).apply(x) as tf.SymbolicTensor;
    }
  }
  const output = hp.taskType === 'classification'
    ? tf.layers.dense({ units: hp.numClasses, activation: 'softmax', name: 'output' }).apply(x) as tf.SymbolicTensor
    : tf.layers.dense({ units: 1, activation: 'linear', name: 'output' }).apply(x) as tf.SymbolicTensor;

  const model = tf.model({ inputs: input, outputs: output, name: 'lstm_model' });
  compileModel(model, hp);
  return model;
}

// Build a lightweight transformer-inspired model.
// Uses a single self-attention-like block (MultiHeadAttention is not in tfjs-layers;
// we approximate with a dense projection + additive self-attention) followed by
// global average pooling and a classification head.
export function buildTransformerModel(hp: Hyperparams, numFeatures: number): tf.LayersModel {
  const input = tf.input({ shape: [hp.sequenceLength, numFeatures], name: 'sequence' });

  // Positional encoding via a dense projection (learned, not sinusoidal — simpler in tfjs).
  const x = tf.layers.dense({ units: hp.hiddenUnits[0] ?? 64, activation: 'relu', name: 'proj' }).apply(input) as tf.SymbolicTensor;

  // Self-attention approximation: compute attention weights via a dense layer over
  // the projected features, then multiply back. This is a simplified single-head attention.
  const attnWeights = tf.layers.dense({ units: 1, activation: 'softmax', name: 'attn_weights' }).apply(x) as tf.SymbolicTensor;
  // Weighted sum across the time dimension.
  const weighted = tf.layers.multiply().apply([x, attnWeights]) as tf.SymbolicTensor;
  // Global average pooling across time axis (axis 1).
  const pooled = tf.layers.globalAveragePooling1d({ name: 'pool' }).apply(weighted) as tf.SymbolicTensor;

  // Feed-forward head.
  let head = pooled;
  for (let i = 1; i < hp.hiddenUnits.length; i++) {
    head = tf.layers.dense({ units: hp.hiddenUnits[i], activation: 'relu', name: `ff_${i}` }).apply(head) as tf.SymbolicTensor;
    if (hp.dropout > 0) {
      head = tf.layers.dropout({ rate: hp.dropout, name: `dropout_${i}` }).apply(head) as tf.SymbolicTensor;
    }
  }

  const output = hp.taskType === 'classification'
    ? tf.layers.dense({ units: hp.numClasses, activation: 'softmax', name: 'output' }).apply(head) as tf.SymbolicTensor
    : tf.layers.dense({ units: 1, activation: 'linear', name: 'output' }).apply(head) as tf.SymbolicTensor;

  const model = tf.model({ inputs: input, outputs: output, name: 'transformer_model' });
  compileModel(model, hp);
  return model;
}

// Compile with the right optimizer + loss for the task type.
function compileModel(model: tf.LayersModel, hp: Hyperparams): void {
  const optimizer = tf.train.adam(hp.learningRate);
  if (hp.taskType === 'classification') {
    model.compile({
      optimizer,
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });
  } else {
    model.compile({
      optimizer,
      loss: 'meanSquaredError',
      metrics: ['mae'],
    });
  }
}

// Factory: build a model by architecture name.
export function buildModel(architecture: Architecture, hp: Hyperparams, numFeatures: number): tf.LayersModel {
  switch (architecture) {
    case 'dense': return buildDenseModel(hp, numFeatures);
    case 'lstm': return buildLSTMModel(hp, numFeatures);
    case 'transformer': return buildTransformerModel(hp, numFeatures);
    default: throw new Error(`Unknown architecture: ${architecture}`);
  }
}

// Convert class index labels to one-hot encoded tensors for classification.
export function toOneHot(labels: number[], numClasses: number): tf.Tensor2D {
  return tf.tidy(() => {
    const buffer = tf.buffer([labels.length, numClasses]);
    for (let i = 0; i < labels.length; i++) buffer.set(1, i, labels[i]);
    return buffer.toTensor() as tf.Tensor2D;
  });
}
