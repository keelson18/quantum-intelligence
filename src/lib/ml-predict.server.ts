// Ported ML prediction service: pure TypeScript feature engineering plus a
// logistic-regression ensemble. Server-side only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverConfig } from "../config/env.server";

type AdminClient = SupabaseClient<any, any, any>;

// ---- Config ----

const BINANCE = serverConfig().marketRestUrl;
const PRED_HORIZON = 5;
const TRAIN_FRACTION = 0.7;

interface ModelMember {
  weights: number[];
  bias: number;
  mean: number[];
  std: number[];
  lr: number;
  epochs: number;
}

interface ModelState {
  models: ModelMember[];
  metrics: { accuracy: number; f1: number; samples: number; precision: number; recall: number };
  trainedAt: string;
  dataRange: { start: number; end: number };
  version: string;
  featureNames: string[];
}

let modelState: ModelState | null = null;

// ============================================================================
// Feature engineering — derived from indicators, price action, market structure,
// volume, and volatility. Produces a rich feature vector per candle.
// ============================================================================

function sma(vals: number[], p: number): number[] {
  return vals.map((_, i) => (i < p - 1 ? NaN : vals.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p));
}

function ema(vals: number[], p: number): number[] {
  const k = 2 / (p + 1);
  let prev = vals[0];
  return vals.map((_, i) => (i === 0 ? prev : (prev = vals[i] * k + prev * (1 - k))));
}

function rsiArr(closes: number[], p = 14): number[] {
  const out: number[] = new Array(closes.length).fill(50);
  if (closes.length <= p) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= p; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch; else loss -= ch;
  }
  let avgG = gain / p, avgL = loss / p;
  out[p] = 100 - 100 / (1 + (avgL === 0 ? 100 : avgG / avgL));
  for (let i = p + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0;
    avgG = (avgG * (p - 1) + g) / p;
    avgL = (avgL * (p - 1) + l) / p;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

function stoch(candles: Candle[], p = 14): number[] {
  const out: number[] = new Array(candles.length).fill(50);
  for (let i = p - 1; i < candles.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - p + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    out[i] = hh === ll ? 50 : ((candles[i].close - ll) / (hh - ll)) * 100;
  }
  return out;
}

function adxArr(candles: Candle[], p = 14): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  if (candles.length < p * 2) return out;
  const plusDM: number[] = [0], minusDM: number[] = [0], tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let trS = tr.slice(1, p + 1).reduce((a, b) => a + b, 0);
  let plusS = plusDM.slice(1, p + 1).reduce((a, b) => a + b, 0);
  let minusS = minusDM.slice(1, p + 1).reduce((a, b) => a + b, 0);
  const dxArr: number[] = new Array(candles.length).fill(0);
  for (let i = p; i < candles.length; i++) {
    if (i > p) {
      trS = trS - trS / p + tr[i];
      plusS = plusS - plusS / p + plusDM[i];
      minusS = minusS - minusS / p + minusDM[i];
    }
    const plusDI = trS > 0 ? 100 * (plusS / trS) : 0;
    const minusDI = trS > 0 ? 100 * (minusS / trS) : 0;
    dxArr[i] = (plusDI + minusDI) > 0 ? 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI) : 0;
  }
  let adxVal = 0;
  for (let i = p; i < p * 2; i++) adxVal += dxArr[i];
  adxVal /= p;
  out[p * 2 - 1] = adxVal;
  for (let i = p * 2; i < candles.length; i++) {
    adxVal = (adxVal * (p - 1) + dxArr[i]) / p;
    out[i] = adxVal;
  }
  return out;
}

function obvArr(candles: Candle[]): number[] {
  const out: number[] = [candles[0]?.volume ?? 0];
  for (let i = 1; i < candles.length; i++) {
    const prev = out[i - 1];
    if (candles[i].close > candles[i - 1].close) out.push(prev + candles[i].volume);
    else if (candles[i].close < candles[i - 1].close) out.push(prev - candles[i].volume);
    else out.push(prev);
  }
  return out;
}

function computeFeatures(candles: Candle[]): { features: number[][]; labels: number[]; valid: boolean; names: string[] } {
  if (candles.length < 210) return { features: [], labels: [], valid: false, names: [] };
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const vols = candles.map((c) => c.volume);

  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const macdSignal = ema(macdLine, 9);
  const rsiVals = rsiArr(closes, 14);
  const stochVals = stoch(candles, 14);
  const adxVals = adxArr(candles, 14);
  const obvVals = obvArr(candles);
  const bbMid = sma(closes, 20);
  const bbWidth = bbMid.map((m, i) => {
    if (isNaN(m)) return 0;
    let sumSq = 0;
    for (let j = i - 19; j <= i; j++) sumSq += (closes[j] - m) ** 2;
    return (4 * Math.sqrt(sumSq / 20)) / m;
  });
  const volChange = vols.map((v, i) => (i === 0 ? 0 : v / (vols[i - 1] || 1) - 1));
  const volSma = sma(vols, 20);
  const atrVals: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    atrVals[i] = i < 14 ? tr : (atrVals[i - 1] * 13 + tr) / 14;
  }
  // Market structure: recent swing high/low relative position.
  const swingHigh = (i: number, lookback = 20) => Math.max(...highs.slice(Math.max(0, i - lookback), i + 1));
  const swingLow = (i: number, lookback = 20) => Math.min(...lows.slice(Math.max(0, i - lookback), i + 1));

  const names = [
    'ret_1', 'ret_3', 'ret_5', 'ret_10', 'ret_20',
    'rsi', 'macd', 'macd_signal', 'macd_hist',
    'ma20_dev', 'ma50_dev', 'ma200_dev',
    'bb_width', 'vol_change', 'vol_ratio',
    'atr_pct', 'stoch', 'adx',
    'obv_slope', 'dist_swing_high', 'dist_swing_low',
    'range_pct', 'body_ratio',
  ];

  const features: number[][] = [];
  const labels: number[] = [];
  for (let i = 200; i < closes.length - PRED_HORIZON; i++) {
    const ret = (p: number) => closes[i] / closes[i - p] - 1;
    const sh = swingHigh(i), sl = swingLow(i);
    const range = highs[i] - lows[i] || 1;
    const body = Math.abs(closes[i] - candles[i].open);
    const f = [
      ret(1), ret(3), ret(5), ret(10), ret(20),
      rsiVals[i] / 100,
      macdLine[i] / closes[i],
      macdSignal[i] / closes[i],
      (macdLine[i] - macdSignal[i]) / closes[i],
      ma20[i] / closes[i] - 1,
      ma50[i] / closes[i] - 1,
      ma200[i] / closes[i] - 1,
      bbWidth[i],
      volChange[i],
      vols[i] / (volSma[i] || 1),
      atrVals[i] / closes[i],
      stochVals[i] / 100,
      adxVals[i] / 100,
      (obvVals[i] - obvVals[Math.max(0, i - 10)]) / (Math.abs(obvVals[i]) || 1),
      (sh - closes[i]) / closes[i],
      (closes[i] - sl) / closes[i],
      range / closes[i],
      body / range,
    ];
    const future = closes[i + PRED_HORIZON];
    features.push(f);
    labels.push(future > closes[i] ? 1 : 0);
  }
  return { features, labels, valid: features.length > 50, names };
}

// ============================================================================
// Logistic regression ensemble — three members with different learning rates
// and epoch counts, averaged for robustness (poor-man's bagging).
// ============================================================================

function trainLogistic(features: number[][], labels: number[], epochs: number, lr: number): ModelMember {
  const n = features.length;
  const d = features[0].length;
  const mean = new Array(d).fill(0);
  for (const f of features) for (let j = 0; j < d; j++) mean[j] += f[j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  const std = new Array(d).fill(0);
  for (const f of features) for (let j = 0; j < d; j++) std[j] += (f[j] - mean[j]) ** 2;
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / n) || 1;
  const X = features.map((f) => f.map((v, j) => (v - mean[j]) / std[j]));
  const weights = new Array(d).fill(0);
  let bias = 0;
  const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
  for (let e = 0; e < epochs; e++) {
    const gradW = new Array(d).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      const z = bias + X[i].reduce((s, x, j) => s + x * weights[j], 0);
      const err = sigmoid(z) - labels[i];
      for (let j = 0; j < d; j++) gradW[j] += err * X[i][j];
      gradB += err;
    }
    // L2 regularization (weight decay).
    for (let j = 0; j < d; j++) weights[j] -= (lr * (gradW[j] / n + 0.001 * weights[j]));
    bias -= (lr * gradB) / n;
  }
  return { weights, bias, mean, std, lr, epochs };
}

function predictProba(model: ModelMember, x: number[]): number {
  const xStd = x.map((v, j) => (v - model.mean[j]) / model.std[j]);
  const z = model.bias + xStd.reduce((s, v, j) => s + v * model.weights[j], 0);
  return 1 / (1 + Math.exp(-z));
}

function ensemblePredict(models: ModelMember[], x: number[]): number {
  return models.reduce((sum, m) => sum + predictProba(m, x), 0) / models.length;
}

// ============================================================================
// Data fetching + rate limiting + auth
// ============================================================================

async function fetchCandles(symbol: string, timeframe: string, limit = 1000): Promise<Candle[]> {
  const url = `${BINANCE}/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const raw = (await res.json()) as unknown[][];
  return raw.map((k) => ({
    time: Math.floor((k[0] as number) / 1000),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }));
}

export async function checkRate(supabase: AdminClient, key: string, maxPerMin: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = new Date(now - 60000).toISOString();
  const { data } = await supabase.from('ml_predictions').select('created_at').eq('symbol', `__rl__${key}`).gte('created_at', windowStart);
  return (data?.length ?? 0) < maxPerMin;
}


async function retrainInternal(supabase: AdminClient, symbol: string, timeframe: string): Promise<{ ok: boolean; metrics: MetricsSummary; version: string }> {
  const candles = await fetchCandles(symbol, timeframe, 1000);
  const { features, labels, valid, names } = computeFeatures(candles);
  if (!valid) throw new Error('Insufficient data for training');

  const n = features.length;
  const trainEnd = Math.floor(n * TRAIN_FRACTION);
  const valEnd = Math.floor(n * 0.85);
  const trainX = features.slice(0, trainEnd);
  const trainY = labels.slice(0, trainEnd);
  const testX = features.slice(valEnd);
  const testY = labels.slice(valEnd);

  // Ensemble: 3 models with different hyperparameters.
  const models: ModelMember[] = [
    trainLogistic(trainX, trainY, 200, 0.1),
    trainLogistic(trainX, trainY, 300, 0.05),
    trainLogistic(trainX, trainY, 150, 0.15),
  ];

  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < testX.length; i++) {
    const p = ensemblePredict(models, testX[i]);
    const pred = p > 0.5 ? 1 : 0;
    if (pred === 1 && testY[i] === 1) tp++;
    else if (pred === 1 && testY[i] === 0) fp++;
    else if (pred === 0 && testY[i] === 0) tn++;
    else fn++;
  }
  const accuracy = (tp + tn) / (testX.length || 1);
  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  const f1 = 2 * (precision * recall) / (precision + recall || 1);
  const version = new Date().toISOString().slice(0, 10);

  modelState = {
    models,
    metrics: {
      accuracy: Number(accuracy.toFixed(3)),
      f1: Number(f1.toFixed(3)),
      precision: Number(precision.toFixed(3)),
      recall: Number(recall.toFixed(3)),
      samples: n,
    },
    trainedAt: new Date().toISOString(),
    dataRange: { start: candles[0].time, end: candles[candles.length - 1].time },
    version,
    featureNames: names,
  };
  console.log(`[ml] retrained ensemble on ${symbol} ${timeframe}: acc=${accuracy.toFixed(3)} f1=${f1.toFixed(3)} samples=${n} features=${names.length}`);
  return { ok: true, metrics: modelState.metrics, version };
}

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }

interface MetricsSummary { accuracy: number; f1: number; samples: number; precision: number; recall: number; }



export interface MLPredictionResult {
  pair: string;
  timeframe: string;
  prediction: 'up' | 'down' | 'flat';
  probability: number;
  expected_move_pct: number;
  model_version: string;
  confidence: 'high' | 'medium' | 'low';
}

export async function runPrediction(
  admin: AdminClient,
  pair: string,
  timeframe: string,
): Promise<MLPredictionResult> {
  if (!modelState) await retrainInternal(admin, pair, timeframe);
  if (!modelState) throw new Error('Model not available');

  const candles = await fetchCandles(pair, timeframe, 1000);
  const { features, valid } = computeFeatures(candles);
  if (!valid || features.length === 0) throw new Error('Insufficient market data');

  const last = features[features.length - 1];
  const probUp = ensemblePredict(modelState.models, last);
  const prediction = (probUp > 0.55 ? 'up' : probUp < 0.45 ? 'down' : 'flat') as MLPredictionResult['prediction'];
  const expectedMovePct = (probUp - 0.5) * 2 * (modelState.metrics.accuracy * 5);
  const confidence = (probUp > 0.7 || probUp < 0.3 ? 'high' : probUp > 0.6 || probUp < 0.4 ? 'medium' : 'low') as MLPredictionResult['confidence'];

  const out: MLPredictionResult = {
    pair,
    timeframe,
    prediction,
    probability: Number(probUp.toFixed(3)),
    expected_move_pct: Number(expectedMovePct.toFixed(2)),
    model_version: modelState.version,
    confidence,
  };

  await admin.from('ml_predictions').upsert(
    {
      symbol: pair,
      timeframe,
      prediction,
      probability: probUp,
      expected_move_pct: expectedMovePct,
      model_version: modelState.version,
      confidence,
      payload: out,
    },
    { onConflict: 'symbol,timeframe' },
  );

  return out;
}

export async function runRetrain(admin: AdminClient, pair: string, timeframe: string) {
  return retrainInternal(admin, pair, timeframe);
}

export function getModelStatus() {
  return {
    trained: modelState !== null,
    version: modelState?.version ?? 'untrained',
    trainedAt: modelState?.trainedAt ?? null,
    metrics: modelState?.metrics ?? null,
    dataRange: modelState?.dataRange ?? null,
    horizon: PRED_HORIZON,
    featureCount: modelState?.featureNames.length ?? 0,
    modelCount: modelState?.models.length ?? 0,
  };
}
