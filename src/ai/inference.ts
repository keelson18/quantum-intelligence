// ============================================================================
// inference.ts — in-browser prediction using a loaded TF.js model
// Loads model weights from IndexedDB, normalizes input using the stored
// training stats (mean/std), runs a forward pass, and returns prediction +
// confidence. All tensor memory is properly disposed to avoid leaks.
// ============================================================================

import * as tf from '@tensorflow/tfjs';
import { loadModelWeights } from './modelStorage';
import { computeIndicators } from '../lib/indicators';
import { analyzeMarketStructure, analyzeSmartMoney } from '../lib/structure';
import { FEATURE_NAMES } from './dataLoader';
import type { Candle } from '../lib/types';
import type { InferenceResult, Hyperparams, Architecture } from './types';

interface LoadedModel {
  model: tf.LayersModel;
  mean: number[];
  std: number[];
  hyperparams: Hyperparams;
  architecture: Architecture;
}

const modelCache = new Map<string, LoadedModel>();
let tfReady = false;

// Ensure the TF.js backend is initialized before any inference.
async function ensureTFReady(): Promise<void> {
  if (tfReady) return;
  await tf.ready();
  tfReady = true;
  console.log('[inference] TF.js backend ready:', tf.getBackend());
}

// Load a model + its normalization stats. Caches in memory for repeated inference.
export async function loadModel(
  modelId: string,
  mean: number[],
  std: number[],
  hyperparams: Hyperparams,
  architecture: Architecture,
): Promise<tf.LayersModel | null> {
  await ensureTFReady();
  const cached = modelCache.get(modelId);
  if (cached) return cached.model;

  const model = await loadModelWeights(modelId);
  if (!model) {
    console.warn(`[inference] No saved weights found for model ${modelId}. Has it been trained?`);
    return null;
  }
  modelCache.set(modelId, { model, mean, std, hyperparams, architecture });
  console.log(`[inference] Model ${modelId} loaded (${architecture}), input shape:`, model.inputs?.[0]?.shape);
  return model;
}

// Run inference on the latest candles for a symbol.
// Builds the same fused feature vector used during training, normalizes it
// using the stored mean/std, and runs a forward pass.
export async function predictFromCandles(
  modelId: string,
  candles: Candle[],
  mean: number[],
  std: number[],
  hyperparams: Hyperparams,
  architecture: Architecture,
): Promise<InferenceResult | null> {
  if (candles.length < 220) {
    console.warn('[inference] Not enough candles for prediction:', candles.length);
    return null;
  }

  await ensureTFReady();
  const model = await loadModel(modelId, mean, std, hyperparams, architecture);
  if (!model) return null;

  const isSequence = (architecture === 'lstm' || architecture === 'transformer') && hyperparams.sequenceLength > 0;

  try {
    if (isSequence) {
      // For sequence models, build a window of recent feature vectors.
      // Optimization: compute indicators ONCE on the full array, then slice
      // the precomputed indicator arrays for each step — avoids O(n²) recomputation.
      const seqLen = hyperparams.sequenceLength;
      const features = buildFeatureVectorsBatch(candles, seqLen);
      const normalized = features.map((f) => normalizeVector(f, mean, std));
      return runPrediction(model, normalized, true, hyperparams);
    } else {
      const features = buildFeatureVector(candles);
      const normalized = normalizeVector(features, mean, std);
      return runPrediction(model, normalized, false, hyperparams);
    }
  } catch (err) {
    console.error('[inference] Prediction failed:', err);
    throw err;
  }
}

// Normalize a single feature vector using stored mean/std.
function normalizeVector(features: number[], mean: number[], std: number[]): number[] {
  if (mean.length === 0 || std.length === 0) {
    // No stats available — return as-is (better than crashing).
    console.warn('[inference] No normalization stats — using raw features');
    return features;
  }
  return features.map((v, j) => (v - (mean[j] ?? 0)) / (std[j] ?? 1));
}

// Build the fused feature vector from candles — same as dataLoader.candleSamples.
function buildFeatureVector(candles: Candle[]): number[] {
  const i = candles.length - 1;
  const ind = computeIndicators(candles);
  const structure = analyzeMarketStructure(candles);
  const closes = candles.map((c) => c.close);
  const vols = candles.map((c) => c.volume);
  const volSma = vols.slice(-20).reduce((a, b) => a + b, 0) / 20 || 1;
  const obvSlope = (ind.obv[i] - ind.obv[Math.max(0, i - 10)]) / (Math.abs(ind.obv[i]) || 1);
  const sh = Math.max(...candles.slice(Math.max(0, i - 20), i + 1).map((c) => c.high));
  const sl = Math.min(...candles.slice(Math.max(0, i - 20), i + 1).map((c) => c.low));
  const regimeScore = structure.regime === 'trend_up' ? 1 : structure.regime === 'trend_down' ? -1 : 0;
  const ret = (p: number) => closes[i] / closes[i - p] - 1;
  return [
    ret(1), ret(3), ret(5), ret(10), ret(20),
    ind.rsi[i] / 100,
    ind.macd.hist[i] / closes[i],
    ind.ema[20][i] / closes[i] - 1,
    ind.ema[50][i] / closes[i] - 1,
    ind.ema[200][i] / closes[i] - 1,
    ind.bollinger.width[i] || 0,
    vols[i] / volSma,
    ind.atr[i] / closes[i],
    (ind.adx[i] || 0) / 100,
    (ind.stochastic.k[i] || 50) / 100,
    obvSlope,
    (sh - closes[i]) / closes[i],
    (closes[i] - sl) / closes[i],
    structure.trendStrength,
    regimeScore,
  ];
}

// Build feature vectors for the last `seqLen` candles in one pass.
// Computes indicators ONCE on the full array, then indexes into the precomputed
// results for each step — O(n) instead of O(n²).
function buildFeatureVectorsBatch(candles: Candle[], seqLen: number): number[][] {
  const ind = computeIndicators(candles);
  const structure = analyzeMarketStructure(candles);
  const smc = analyzeSmartMoney(candles);
  const closes = candles.map((c) => c.close);
  const vols = candles.map((c) => c.volume);
  const volSma = (i: number) => {
    const start = Math.max(0, i - 19);
    return vols.slice(start, i + 1).reduce((a, b) => a + b, 0) / (i - start + 1) || 1;
  };
  const obvSlope = (i: number) => (ind.obv[i] - ind.obv[Math.max(0, i - 10)]) / (Math.abs(ind.obv[i]) || 1);
  const swingHigh = (i: number, lb = 20) => Math.max(...candles.slice(Math.max(0, i - lb), i + 1).map((c) => c.high));
  const swingLow = (i: number, lb = 20) => Math.min(...candles.slice(Math.max(0, i - lb), i + 1).map((c) => c.low));
  const regimeScore = structure.regime === 'trend_up' ? 1 : structure.regime === 'trend_down' ? -1 : 0;
  const inPremium = (i: number) => closes[i] > smc.premiumDiscount.midpoint ? 1 : 0;
  const nearOB = (i: number) => smc.orderBlocks.some((ob) => Math.abs(closes[i] - (ob.high + ob.low) / 2) / closes[i] < 0.01) ? 1 : 0;
  const nearFVG = (i: number) => smc.fairValueGaps.some((fvg) => closes[i] >= fvg.bottom && closes[i] <= fvg.top) ? 1 : 0;

  const result: number[][] = [];
  for (let step = Math.max(200, candles.length - seqLen); step < candles.length; step++) {
    const i = step;
    const ret = (p: number) => closes[i] / closes[i - p] - 1;
    const sh = swingHigh(i), sl = swingLow(i);
    result.push([
      ret(1), ret(3), ret(5), ret(10), ret(20),
      ind.rsi[i] / 100,
      ind.macd.hist[i] / closes[i],
      ind.ema[20][i] / closes[i] - 1,
      ind.ema[50][i] / closes[i] - 1,
      ind.ema[200][i] / closes[i] - 1,
      ind.bollinger.width[i] || 0,
      vols[i] / volSma(i),
      ind.atr[i] / closes[i],
      (ind.adx[i] || 0) / 100,
      (ind.stochastic.k[i] || 50) / 100,
      obvSlope(i),
      (sh - closes[i]) / closes[i],
      (closes[i] - sl) / closes[i],
      structure.trendStrength,
      regimeScore,
      inPremium(i),
      nearOB(i),
      nearFVG(i),
    ]);
  }
  return result;
}

// Run a forward pass and interpret the output.
// Uses tf.tidy for input tensor cleanup; disposes the output tensor manually
// after extracting values with dataSync().
function runPrediction(
  model: tf.LayersModel,
  input: number[] | number[][],
  isSequence: boolean,
  hp: Hyperparams,
): InferenceResult {
  const rawInput = isSequence ? (input as number[][]).flat() : (input as number[]);

  // Build the input tensor inside tidy so it's auto-disposed after predict.
  const outputTensor = tf.tidy(() => {
    const tensor = isSequence
      ? tf.tensor3d([input as number[][]])
      : tf.tensor2d([input as number[]]);
    const out = model.predict(tensor) as tf.Tensor;
    return out; // returned from tidy — input tensor is disposed, output is kept
  });

  // Extract values from the output tensor, then dispose it.
  const outputs = Array.from(outputTensor.dataSync());
  outputTensor.dispose();

  if (hp.taskType === 'classification') {
    const prediction = outputs.indexOf(Math.max(...outputs));
    const confidence = outputs[prediction];
    const labels = ['down', 'flat', 'up'];
    return {
      prediction,
      confidence,
      outputs,
      label: labels[prediction] ?? `class_${prediction}`,
      rawInput,
    };
  } else {
    return {
      prediction: outputs[0],
      confidence: 1,
      outputs,
      rawInput,
    };
  }
}

// Clear the in-memory model cache (call when a model is retrained).
export function clearModelCache(modelId?: string): void {
  if (modelId) {
    const cached = modelCache.get(modelId);
    if (cached) { cached.model.dispose(); modelCache.delete(modelId); }
  } else {
    for (const { model } of modelCache.values()) model.dispose();
    modelCache.clear();
  }
}

// Feature names for display.
export { FEATURE_NAMES };
