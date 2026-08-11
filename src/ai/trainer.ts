// ============================================================================
// trainer.ts — training orchestration
// Spawns the Web Worker for non-blocking training, manages the lifecycle,
// and falls back to main-thread training if Workers are unavailable.
// ============================================================================

import * as tf from '@tensorflow/tfjs';
import { buildModel, toOneHot } from './modelDefinition';
import { saveModelWeights, createModelMeta, updateModelMeta } from './modelStorage';
import type {
  PreparedDataset, Architecture, Hyperparams, TrainingResult,
  EpochMetrics, WorkerRequest, WorkerResponse,
} from './types';

export interface TrainingCallbacks {
  onEpoch?: (metrics: EpochMetrics) => void;
  onDone?: (result: TrainingResult, modelId: string) => void;
  onError?: (message: string) => void;
  onStatus?: (status: 'starting' | 'training' | 'saving' | 'done' | 'cancelled') => void;
}

// Train a model using a Web Worker. Returns a cancel function.
// The worker handles the heavy computation; the main thread only receives
// epoch metrics and saves the final weights.
export async function trainWithWorker(
  dataset: PreparedDataset,
  architecture: Architecture,
  hp: Hyperparams,
  modelName: string,
  callbacks: TrainingCallbacks = {},
): Promise<{ result: TrainingResult; modelId: string; cancel: () => void }> {
  // Create the model metadata row first so we have an ID.
  const modelId = await createModelMeta(modelName, architecture, hp, dataset.featureNames, ['down', 'flat', 'up']);
  if (!modelId) throw new Error('Failed to create model metadata in Supabase.');

  callbacks.onStatus?.('starting');
  await updateModelMeta(modelId, 'training', null);

  // Spawn the worker. Vite handles the import URL.
  const worker = new Worker(new URL('./trainingWorker.ts', import.meta.url), { type: 'module' });

  let resolveFn: (result: TrainingResult) => void;
  let rejectFn: (err: Error) => void;
  const resultPromise = new Promise<TrainingResult>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    switch (msg.type) {
      case 'ready':
        break;
      case 'epoch':
        callbacks.onEpoch?.(msg.metrics);
        callbacks.onStatus?.('training');
        break;
      case 'done':
        callbacks.onStatus?.('saving');
        updateModelMeta(modelId, 'trained', msg.result).then(() => {
          callbacks.onStatus?.('done');
          callbacks.onDone?.(msg.result, modelId);
          resolveFn(msg.result);
        });
        break;
      case 'weights':
        // Weights are saved by the worker to IndexedDB directly.
        break;
      case 'error':
        callbacks.onError?.(msg.message);
        updateModelMeta(modelId, 'failed', null);
        rejectFn(new Error(msg.message));
        break;
      case 'cancelled':
        callbacks.onStatus?.('cancelled');
        resolveFn({
          metrics: [],
          finalMetrics: { loss: 0, accuracy: 0, valLoss: 0, valAccuracy: 0 },
          trainedAt: new Date().toISOString(),
          mean: dataset.mean,
          std: dataset.std,
        });
        break;
    }
  };

  worker.onerror = (e) => {
    callbacks.onError?.(e.message);
    rejectFn(new Error(e.message));
  };

  const req: WorkerRequest = { type: 'train', dataset, architecture, hyperparams: hp, modelId };
  worker.postMessage(req);

  const cancel = () => {
    worker.postMessage({ type: 'cancel' } satisfies WorkerRequest);
  };

  const result = await resultPromise;
  worker.terminate();
  return { result, modelId, cancel };
}

// Fallback: train on the main thread (used if Web Workers aren't available).
// Less ideal because it blocks the UI, but ensures the feature works everywhere.
export async function trainOnMainThread(
  dataset: PreparedDataset,
  architecture: Architecture,
  hp: Hyperparams,
  modelName: string,
  callbacks: TrainingCallbacks = {},
): Promise<{ result: TrainingResult; modelId: string }> {
  const modelId = await createModelMeta(modelName, architecture, hp, dataset.featureNames, ['down', 'flat', 'up']);
  if (!modelId) throw new Error('Failed to create model metadata in Supabase.');
  callbacks.onStatus?.('starting');
  await updateModelMeta(modelId, 'training', null);

  const isSequence = architecture === 'lstm' || architecture === 'transformer';
  const useSequences = isSequence && dataset.sequences && dataset.sequences.length > 0;

  let xsTrain: tf.Tensor, ysTrain: tf.Tensor, xsVal: tf.Tensor, ysVal: tf.Tensor;
  if (useSequences) {
    const seqs = dataset.sequences!;
    const labels = dataset.sequenceLabels!;
    const splitIdx = Math.floor(seqs.length * (1 - hp.validationSplit));
    xsTrain = tf.tensor3d(seqs.slice(0, splitIdx));
    xsVal = tf.tensor3d(seqs.slice(splitIdx));
    ysTrain = toOneHot(labels.slice(0, splitIdx), hp.numClasses);
    ysVal = toOneHot(labels.slice(splitIdx), hp.numClasses);
  } else {
    xsTrain = tf.tensor2d(dataset.xTrain);
    xsVal = tf.tensor2d(dataset.xVal);
    ysTrain = toOneHot(dataset.yTrain, hp.numClasses);
    ysVal = toOneHot(dataset.yVal, hp.numClasses);
  }

  const model = buildModel(architecture, hp, dataset.numFeatures);
  const metricsHistory: EpochMetrics[] = [];

  await model.fit(xsTrain, ysTrain, {
    epochs: hp.epochs,
    batchSize: hp.batchSize,
    validationData: [xsVal, ysVal],
    shuffle: false,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        const m: EpochMetrics = {
          epoch: epoch + 1,
          loss: logs?.loss ?? 0,
          accuracy: logs?.acc,
          valLoss: logs?.val_loss ?? 0,
          valAccuracy: logs?.val_acc,
        };
        metricsHistory.push(m);
        callbacks.onEpoch?.(m);
      },
    },
  });

  callbacks.onStatus?.('saving');
  await saveModelWeights(model, modelId);
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
  await updateModelMeta(modelId, 'trained', result);
  callbacks.onStatus?.('done');
  callbacks.onDone?.(result, modelId);

  xsTrain.dispose(); ysTrain.dispose(); xsVal.dispose(); ysVal.dispose(); model.dispose();
  return { result, modelId };
}
