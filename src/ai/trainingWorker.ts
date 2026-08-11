// ============================================================================
// trainingWorker.ts — Web Worker that runs TF.js training on a separate thread.
// Uses the CPU backend to avoid interfering with WebGL on the main thread.
// Reports epoch metrics back to the main thread via postMessage.
// ============================================================================

/// <reference lib="webworker" />

import * as tf from '@tensorflow/tfjs';
import { buildModel, toOneHot } from './modelDefinition';
import type { WorkerRequest, WorkerResponse, EpochMetrics, PreparedDataset, Architecture, Hyperparams, TrainingResult } from './types';

// Force CPU backend in the worker — WebGL contexts can't be shared across threads.
tf.setBackend('cpu').then(() => tf.ready()).catch((err) => console.error('[worker] backend error:', err));

let cancelled = false;

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'cancel') {
    cancelled = true;
    post({ type: 'cancelled' });
    return;
  }
  if (msg.type !== 'train') return;

  cancelled = false;
  const { dataset, architecture, hyperparams, modelId } = msg;

  try {
    const result = await runTraining(dataset, architecture, hyperparams, modelId);
    if (cancelled) { post({ type: 'cancelled' }); return; }
    post({ type: 'done', result });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

async function runTraining(
  dataset: PreparedDataset,
  architecture: Architecture,
  hp: Hyperparams,
  _modelId: string,
): Promise<TrainingResult> {
  const isSequence = architecture === 'lstm' || architecture === 'transformer';
  const useSequences = isSequence && dataset.sequences && dataset.sequences.length > 0;

  // Build input tensors.
  let xsTrain: tf.Tensor;
  let ysTrain: tf.Tensor;
  let xsVal: tf.Tensor;
  let ysVal: tf.Tensor;

  const numFeatures = dataset.numFeatures;

  if (useSequences) {
    // Sequence models: use the pre-built sliding-window sequences.
    const seqs = dataset.sequences!;
    const labels = dataset.sequenceLabels!;
    const splitIdx = Math.floor(seqs.length * (1 - hp.validationSplit));
    const trainSeqs = seqs.slice(0, splitIdx);
    const trainLabels = labels.slice(0, splitIdx);
    const valSeqs = seqs.slice(splitIdx);
    const valLabels = labels.slice(splitIdx);

    xsTrain = tf.tensor3d(trainSeqs);
    xsVal = tf.tensor3d(valSeqs);
    ysTrain = hp.taskType === 'classification' ? toOneHot(trainLabels, hp.numClasses) : tf.tensor1d(trainLabels);
    ysVal = hp.taskType === 'classification' ? toOneHot(valLabels, hp.numClasses) : tf.tensor1d(valLabels);
  } else {
    // Dense model: use flat feature vectors.
    xsTrain = tf.tensor2d(dataset.xTrain);
    xsVal = tf.tensor2d(dataset.xVal);
    ysTrain = hp.taskType === 'classification' ? toOneHot(dataset.yTrain, hp.numClasses) : tf.tensor1d(dataset.yTrain);
    ysVal = hp.taskType === 'classification' ? toOneHot(dataset.yVal, hp.numClasses) : tf.tensor1d(dataset.yVal);
  }

  const model = buildModel(architecture, hp, numFeatures);

  const metricsHistory: EpochMetrics[] = [];

  // Train with a custom callback that reports each epoch to the main thread.
  await model.fit(xsTrain, ysTrain, {
    epochs: hp.epochs,
    batchSize: hp.batchSize,
    validationData: [xsVal, ysVal],
    shuffle: false, // no shuffle for time-series integrity
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        if (cancelled) {
          model.stopTraining = true;
          return;
        }
        const m: EpochMetrics = {
          epoch: epoch + 1,
          loss: logs?.loss ?? 0,
          accuracy: logs?.acc,
          valLoss: logs?.val_loss ?? 0,
          valAccuracy: logs?.val_acc,
        };
        metricsHistory.push(m);
        post({ type: 'epoch', metrics: m });
      },
    },
  });

  const last = metricsHistory[metricsHistory.length - 1] ?? { loss: 0, valLoss: 0, accuracy: 0, valAccuracy: 0, epoch: 0 };
  const result: TrainingResult = {
    metrics: metricsHistory,
    finalMetrics: {
      loss: last.loss,
      accuracy: last.accuracy ?? 0,
      valLoss: last.valLoss,
      valAccuracy: last.valAccuracy ?? 0,
    },
    trainedAt: new Date().toISOString(),
    mean: dataset.mean,
    std: dataset.std,
  };

  // Save to IndexedDB directly from the worker (works because IndexedDB is accessible).
  try {
    await model.save('indexeddb://qi-model-' + _modelId);
  } catch (err) {
    console.error('[worker] save error:', err);
  }

  // Cleanup tensors.
  xsTrain.dispose();
  ysTrain.dispose();
  xsVal.dispose();
  ysVal.dispose();
  model.dispose();

  return result;
}


function post(msg: WorkerResponse): void {
  (self as unknown as Worker).postMessage(msg);
}

export {};
