// ============================================================================
// Engine 5 — Pattern Intelligence Engine (Master Prompt §12.5, §17)
// Candlestick and chart structures classified into continuation, reversal,
// breakout, retest, compression and expansion families. A pattern is never a
// trade by itself: context qualification is mandatory (spec §17).
// ============================================================================

import type { Candle, GranularRegime, PatternHit, Side } from '../types';
import { detectAllPatterns } from '../patterns';
import { bollinger } from '../indicators';
import { runEngine, type EngineResult, type Evidence } from './contract';
import { ENGINE_REGISTRY } from './registry';

const D = ENGINE_REGISTRY[4];

export type PatternFamily = 'continuation' | 'reversal' | 'breakout' | 'retest' | 'compression' | 'expansion' | 'unclassified';

export interface QualifiedPattern {
  hit: PatternHit;
  family: PatternFamily;
  /** True when the regime supports acting on this pattern. */
  contextSupported: boolean;
  note: string;
}

export interface PatternResult {
  patterns: PatternHit[];
  qualified: QualifiedPattern[];
  volatilityState: 'compression' | 'expansion' | 'neutral';
  bullish: number;
  bearish: number;
}

function classify(name: string): PatternFamily {
  const n = name.toLowerCase();
  if (n.includes('flag') || n.includes('pennant') || n.includes('triangle') || n.includes('rising') || n.includes('falling')) return 'continuation';
  if (n.includes('engulf') || n.includes('hammer') || n.includes('star') || n.includes('doji') || n.includes('head') || n.includes('double') || n.includes('reversal')) return 'reversal';
  if (n.includes('breakout') || n.includes('break')) return 'breakout';
  if (n.includes('retest') || n.includes('throwback')) return 'retest';
  if (n.includes('wedge') || n.includes('squeeze') || n.includes('inside')) return 'compression';
  if (n.includes('expansion') || n.includes('marubozu')) return 'expansion';
  return 'unclassified';
}

export function patternEngine(
  contextId: string,
  candles: Candle[],
  regime: GranularRegime | null,
  proposedSide: Side,
): EngineResult<PatternResult> {
  return runEngine<PatternResult>(D.id, D.version, contextId, () => {
    if (candles.length < 30) {
      return { status: 'insufficient_data', result: null, confidence: 0, warnings: ['Insufficient history for pattern detection'] };
    }

    const patterns = detectAllPatterns(candles);
    const bb = bollinger(candles.map((c) => c.close), 20, 2);
    const widths = bb.width.filter((w) => Number.isFinite(w));
    const lastWidth = widths[widths.length - 1] ?? 0;
    const avgWidth = widths.length ? widths.reduce((a, b) => a + b, 0) / widths.length : 0;
    const volatilityState: PatternResult['volatilityState'] =
      avgWidth === 0 ? 'neutral' : lastWidth < avgWidth * 0.7 ? 'compression' : lastWidth > avgWidth * 1.3 ? 'expansion' : 'neutral';

    const trending = regime === 'strong_uptrend' || regime === 'weak_uptrend' || regime === 'strong_downtrend' || regime === 'weak_downtrend' || regime === 'breakout';
    const ranging = regime === 'range_bound' || regime === 'low_volatility' || regime === 'accumulation' || regime === 'distribution';

    const qualified: QualifiedPattern[] = patterns.map((hit) => {
      const family = classify(hit.name);
      let contextSupported = true;
      let note = 'Pattern accepted in current context';
      if (family === 'reversal' && trending) {
        contextSupported = false;
        note = 'Reversal pattern against an established trend — context does not support acting on it alone';
      } else if (family === 'continuation' && ranging) {
        contextSupported = false;
        note = 'Continuation pattern inside a range — no trend to continue';
      } else if (family === 'breakout' && volatilityState === 'compression') {
        note = 'Breakout pattern forming out of compression — watch for expansion confirmation';
      }
      return { hit, family, contextSupported, note };
    });

    const bullish = patterns.filter((p) => p.direction === 'bullish').length;
    const bearish = patterns.filter((p) => p.direction === 'bearish').length;
    const supporting = qualified.filter(
      (q) => q.contextSupported && ((proposedSide === 'buy' && q.hit.direction === 'bullish') || (proposedSide === 'sell' && q.hit.direction === 'bearish')),
    ).length;

    const evidence: Evidence[] = [
      { key: 'patterns_detected', value: patterns.length },
      { key: 'context_supported', value: qualified.filter((q) => q.contextSupported).length },
      { key: 'bullish_patterns', value: bullish },
      { key: 'bearish_patterns', value: bearish },
      { key: 'volatility_state', value: volatilityState },
      ...qualified.slice(0, 6).map((q) => ({ key: q.hit.name, value: q.family, note: q.note })),
    ];

    return {
      status: patterns.length === 0 ? 'degraded' : 'ok',
      result: { patterns, qualified, volatilityState, bullish, bearish },
      confidence: Math.min(1, supporting * 0.25),
      evidence,
      warnings: patterns.length === 0 ? ['No patterns detected in the current window'] : [],
    };
  });
}
