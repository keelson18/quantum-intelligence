// ============================================================================
// dataLoader.ts — multi-source data fetch, feature engineering, normalization
// Fetches from Supabase tables (ai_training_data, ml_predictions, candles) and
// from the live Binance REST API, fuses everything into a normalized dataset.
// ============================================================================

import { supabase } from '../lib/supabase';
import { fetchKlines } from '../lib/market';
import { computeIndicators } from '../lib/indicators';
import { analyzeMarketStructure } from '../lib/structure';
import { analyzeSmartMoney } from '../lib/structure';
import type { Candle, Timeframe } from '../lib/types';
import type { PreparedDataset, TrainingSample } from './types';

// Feature names for the fused feature vector — used by every architecture.
export const FEATURE_NAMES = [
  'ret_1', 'ret_3', 'ret_5', 'ret_10', 'ret_20',
  'rsi', 'macd_hist', 'ma20_dev', 'ma50_dev', 'ma200_dev',
  'bb_width', 'vol_ratio', 'atr_pct', 'adx', 'stoch',
  'obv_slope', 'dist_swing_high', 'dist_swing_low',
  'trend_strength', 'regime_score',
  'in_premium', 'near_order_block', 'near_fvg',
] as const;

// Fetch labeled training data stored by the user in Supabase.
export async function fetchStoredTrainingData(symbol: string): Promise<TrainingSample[]> {
  const { data, error } = await supabase
    .from('ai_training_data')
    .select('features, label, label_type')
    .eq('symbol', symbol)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    features: Object.values(row.features as Record<string, number>),
    label: Number(row.label),
  }));
}

// Generate training data from historical candles + indicators + structure.
// This is the multi-source data fusion: raw OHLCV → indicators → structure → labeled samples.
export async function generateTrainingData(
  symbol: string,
  timeframe: Timeframe,
  horizon = 5,
): Promise<TrainingSample[]> {
  const candles = await fetchKlines(symbol, timeframe, 1000);
  if (candles.length < 220) return [];
  return candleSamples(candles, horizon);
}

// Build labeled samples from a candle array using the fused feature vector.
export function candleSamples(candles: Candle[], horizon = 5): TrainingSample[] {
  if (candles.length < 220) return [];
  const ind = computeIndicators(candles);
  const structure = analyzeMarketStructure(candles);
  const smc = analyzeSmartMoney(candles);
  // Precompute SMC feature helpers for the feature vector.
  const inPremium = (i: number) => {
    const range = smc.premiumDiscount;
    return closes[i] > range.midpoint ? 1 : 0;
  };
  const nearOrderBlock = (i: number) => {
    const price = closes[i];
    return smc.orderBlocks.some((ob) => Math.abs(price - (ob.high + ob.low) / 2) / price < 0.01) ? 1 : 0;
  };
  const nearFVG = (i: number) => {
    const price = candles[i].close;
    return smc.fairValueGaps.some((fvg) => price >= fvg.bottom && price <= fvg.top) ? 1 : 0;
  };
  const closes = candles.map((c) => c.close);
  const vols = candles.map((c) => c.volume);
  const volSma = movingAverage(vols, 20);
  const obvSlope = (i: number) => {
    const start = Math.max(0, i - 10);
    return (ind.obv[i] - ind.obv[start]) / (Math.abs(ind.obv[i]) || 1);
  };
  const swingHigh = (i: number, lb = 20) => Math.max(...candles.slice(Math.max(0, i - lb), i + 1).map((c) => c.high));
  const swingLow = (i: number, lb = 20) => Math.min(...candles.slice(Math.max(0, i - lb), i + 1).map((c) => c.low));
  const samples: TrainingSample[] = [];
  for (let i = 200; i < candles.length - horizon; i++) {
    const ret = (p: number) => closes[i] / closes[i - p] - 1;
    const sh = swingHigh(i), sl = swingLow(i);
    const regimeScore = structure.regime === 'trend_up' ? 1
      : structure.regime === 'trend_down' ? -1
      : 0;
    const features = [
      ret(1), ret(3), ret(5), ret(10), ret(20),
      ind.rsi[i] / 100,
      ind.macd.hist[i] / closes[i],
      ind.ema[20][i] / closes[i] - 1,
      ind.ema[50][i] / closes[i] - 1,
      ind.ema[200][i] / closes[i] - 1,
      ind.bollinger.width[i] || 0,
      vols[i] / (volSma[i] || 1),
      ind.atr[i] / closes[i],
      (ind.adx[i] || 0) / 100,
      (ind.stochastic.k[i] || 50) / 100,
      obvSlope(i),
      (sh - closes[i]) / closes[i],
      (closes[i] - sl) / closes[i],
      structure.trendStrength,
      regimeScore,
      inPremium(i),
      nearOrderBlock(i),
      nearFVG(i),
    ];
    // Label: 3-class (0=down, 1=flat, 2=up) — will price be higher/lower after N candles?
    const future = closes[i + horizon];
    const change = (future - closes[i]) / closes[i];
    const threshold = 0.005; // 0.5%
    const label = change > threshold ? 2 : change < -threshold ? 0 : 1;
    samples.push({ features, label });
  }
  return samples;
}

// Normalize features: z-score standardization. Returns mean/std for inference reuse.
export function normalize(samples: TrainingSample[]): { normalized: TrainingSample[]; mean: number[]; std: number[] } {
  if (samples.length === 0) return { normalized: [], mean: [], std: [] };
  const n = samples.length;
  const d = samples[0].features.length;
  const mean = new Array(d).fill(0);
  for (const s of samples) for (let j = 0; j < d; j++) mean[j] += s.features[j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  const std = new Array(d).fill(0);
  for (const s of samples) for (let j = 0; j < d; j++) std[j] += (s.features[j] - mean[j]) ** 2;
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / n) || 1;
  const normalized = samples.map((s) => ({
    label: s.label,
    features: s.features.map((v, j) => (v - mean[j]) / std[j]),
  }));
  return { normalized, mean, std };
}

// Prepare a full dataset: combine stored + generated data, normalize, split train/val.
export async function prepareDataset(
  symbol: string,
  timeframe: Timeframe,
  hyperparams: { validationSplit: number; sequenceLength: number },
): Promise<PreparedDataset> {
  // Multi-source fusion: stored Supabase data + freshly generated candle-derived data.
  const [stored, generated] = await Promise.all([
    fetchStoredTrainingData(symbol),
    generateTrainingData(symbol, timeframe),
  ]);
  const combined = [...generated, ...stored];
  if (combined.length < 20) {
    throw new Error(`Insufficient training data: only ${combined.length} samples for ${symbol}. Need at least 20.`);
  }
  const { normalized, mean, std } = normalize(combined);
  // Chronological split (no shuffling for time-series): last portion is validation.
  const splitIdx = Math.floor(normalized.length * (1 - hyperparams.validationSplit));
  const xTrain = normalized.slice(0, splitIdx).map((s) => s.features);
  const yTrain = normalized.slice(0, splitIdx).map((s) => s.label);
  const xVal = normalized.slice(splitIdx).map((s) => s.features);
  const yVal = normalized.slice(splitIdx).map((s) => s.label);

  // Build sequences for LSTM/transformer (sliding window over normalized features).
  const sequences: number[][][] = [];
  const sequenceLabels: number[] = [];
  const seqLen = hyperparams.sequenceLength;
  for (let i = seqLen; i < normalized.length; i++) {
    const window = normalized.slice(i - seqLen, i).map((s) => s.features);
    sequences.push(window);
    sequenceLabels.push(normalized[i].label);
  }

  return {
    xTrain, yTrain, xVal, yVal,
    featureNames: [...FEATURE_NAMES],
    numFeatures: FEATURE_NAMES.length,
    mean, std,
    sequences, sequenceLabels,
  };
}

// Helper: simple moving average (local to avoid circular import).
function movingAverage(vals: number[], period: number): number[] {
  return vals.map((_, i) => (i < period - 1 ? 0 : vals.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period));
}

// Save a batch of labeled samples to Supabase for future training (online learning).
export async function saveTrainingSamples(
  symbol: string,
  samples: TrainingSample[],
  source = 'generated',
): Promise<void> {
  if (samples.length === 0) return;
  const rows = samples.map((s) => ({
    symbol,
    source,
    features: Object.fromEntries(s.features.map((v, i) => [FEATURE_NAMES[i] ?? `f${i}`, v])),
    label: s.label,
    label_type: 'classification' as const,
  }));
  const { error } = await supabase.from('ai_training_data').insert(rows);
  if (error) console.error('Failed to save training samples:', error);
}
