// ============================================================================
// Engine 9 — Historical Similarity Engine (Master Prompt §12.9, §21)
// Compares the current context with historical contexts using a normalised
// feature vector and reports forward outcomes with sample size and quality.
// Small or biased samples must NOT be presented as strong evidence.
// ============================================================================

import type { Candle } from '../types';
import { atr, adx as adxSeries, rsi as rsiSeries } from '../indicators';
import { runEngine, type EngineResult, type Evidence } from './contract';
import { ENGINE_REGISTRY } from './registry';

const D = ENGINE_REGISTRY[8];

const WINDOW = 20;
const HORIZON = 10;

export interface SimilarCase {
  index: number;
  time: number;
  similarity: number; // 0..1
  forwardReturnPct: number;
  outcome: 'up' | 'down' | 'flat';
}

export interface SimilarityResult {
  cases: SimilarCase[];
  sampleSize: number;
  sampleQuality: 'strong' | 'moderate' | 'weak' | 'insufficient';
  upRate: number;
  downRate: number;
  avgForwardReturnPct: number;
  medianForwardReturnPct: number;
}

function featureVector(candles: Candle[], end: number): number[] | null {
  if (end < WINDOW + 30) return null;
  const slice = candles.slice(0, end + 1);
  const closes = slice.map((c) => c.close);
  const a = atr(slice, 14);
  const adxArr = adxSeries(slice, 14);
  const rsiArr = rsiSeries(closes, 14);
  const close = closes[closes.length - 1];
  if (!close) return null;
  const windowCloses = closes.slice(-WINDOW);
  const first = windowCloses[0];
  const slope = first ? (close - first) / first : 0;
  const highs = slice.slice(-WINDOW).map((c) => c.high);
  const lows = slice.slice(-WINDOW).map((c) => c.low);
  const range = Math.max(...highs) - Math.min(...lows);
  const v = [
    slope * 10,
    ((a[a.length - 1] ?? 0) / close) * 50,
    (adxArr[adxArr.length - 1] ?? 0) / 100,
    (rsiArr[rsiArr.length - 1] ?? 50) / 100,
    close > 0 ? (range / close) * 20 : 0,
    range > 0 ? (close - Math.min(...lows)) / range : 0.5,
  ];
  return v.every((x) => Number.isFinite(x)) ? v : null;
}

function distance(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

export function historicalSimilarityEngine(contextId: string, candles: Candle[]): EngineResult<SimilarityResult> {
  return runEngine<SimilarityResult>(D.id, D.version, contextId, () => {
    const current = featureVector(candles, candles.length - 1);
    if (!current || candles.length < 150) {
      return {
        status: 'insufficient_data',
        result: null,
        confidence: 0,
        warnings: ['Not enough history to build a historical similarity sample'],
      };
    }

    const scored: SimilarCase[] = [];
    for (let i = WINDOW + 30; i < candles.length - HORIZON - 1; i++) {
      const v = featureVector(candles, i);
      if (!v) continue;
      const d = distance(current, v);
      const entry = candles[i].close;
      const exit = candles[i + HORIZON].close;
      if (!entry || !exit) continue;
      const fwd = ((exit - entry) / entry) * 100;
      scored.push({
        index: i,
        time: candles[i].time,
        similarity: 1 / (1 + d),
        forwardReturnPct: fwd,
        outcome: fwd > 0.2 ? 'up' : fwd < -0.2 ? 'down' : 'flat',
      });
    }

    const cases = scored.sort((a, b) => b.similarity - a.similarity).slice(0, 25);
    const sampleSize = cases.length;
    const sampleQuality: SimilarityResult['sampleQuality'] =
      sampleSize >= 20 ? 'strong' : sampleSize >= 12 ? 'moderate' : sampleSize >= 5 ? 'weak' : 'insufficient';

    const ups = cases.filter((c) => c.outcome === 'up').length;
    const downs = cases.filter((c) => c.outcome === 'down').length;
    const returns = cases.map((c) => c.forwardReturnPct).sort((a, b) => a - b);
    const avg = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const median = returns.length ? returns[Math.floor(returns.length / 2)] : 0;
    const upRate = sampleSize ? ups / sampleSize : 0;
    const downRate = sampleSize ? downs / sampleSize : 0;

    const edge = Math.abs(upRate - downRate);
    const qualityFactor = sampleQuality === 'strong' ? 1 : sampleQuality === 'moderate' ? 0.6 : sampleQuality === 'weak' ? 0.3 : 0;

    const evidence: Evidence[] = [
      { key: 'sample_size', value: sampleSize, note: `quality ${sampleQuality}` },
      { key: 'up_rate', value: Number(upRate.toFixed(3)) },
      { key: 'down_rate', value: Number(downRate.toFixed(3)) },
      { key: 'avg_forward_return_pct', value: Number(avg.toFixed(3)), note: `${HORIZON} bars ahead` },
      { key: 'median_forward_return_pct', value: Number(median.toFixed(3)) },
      { key: 'top_similarity', value: Number((cases[0]?.similarity ?? 0).toFixed(3)) },
    ];

    const warnings: string[] = [];
    if (sampleQuality === 'weak' || sampleQuality === 'insufficient') warnings.push('Sample is small — historical evidence must not be treated as strong');

    return {
      status: sampleQuality === 'insufficient' ? 'insufficient_data' : sampleQuality === 'weak' ? 'degraded' : 'ok',
      result: { cases, sampleSize, sampleQuality, upRate, downRate, avgForwardReturnPct: avg, medianForwardReturnPct: median },
      confidence: edge * qualityFactor,
      evidence,
      warnings,
    };
  });
}
