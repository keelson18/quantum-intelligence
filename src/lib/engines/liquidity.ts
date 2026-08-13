// ============================================================================
// Engine 4 — Liquidity Intelligence Engine (Master Prompt §12.4, §16)
// Liquidity pools, prior/session highs and lows, sweeps, displacement and
// stop-run candidates. All findings are INFERRED from candles: this engine
// never claims order-book access (spec §16).
// ============================================================================

import type { Candle, LiquidityAnalysis } from '../types';
import { analyzeLiquidity } from '../institutionalEngine';
import { runEngine, type EngineResult, type Evidence } from './contract';
import { ENGINE_REGISTRY } from './registry';

const D = ENGINE_REGISTRY[3];

export type ObservationKind = 'observed' | 'inferred';

export interface LiquidityResult {
  analysis: LiquidityAnalysis;
  /** Every claim is labelled observation vs inference per spec §16. */
  labelled: { claim: string; kind: ObservationKind }[];
  stopRunCandidates: { level: number; side: 'buy_side' | 'sell_side' }[];
  orderBookAvailable: false;
}

export function liquidityEngine(contextId: string, candles: Candle[]): EngineResult<LiquidityResult> {
  return runEngine<LiquidityResult>(D.id, D.version, contextId, () => {
    if (candles.length < 30) {
      return { status: 'insufficient_data', result: null, confidence: 0, warnings: ['Insufficient history for liquidity mapping'] };
    }

    const analysis = analyzeLiquidity(candles);
    const labelled: LiquidityResult['labelled'] = [
      { claim: `${analysis.buySideLiquidity.length} buy-side pools mapped from prior highs`, kind: 'observed' },
      { claim: `${analysis.sellSideLiquidity.length} sell-side pools mapped from prior lows`, kind: 'observed' },
      { claim: `${analysis.equalHighs.length} equal highs / ${analysis.equalLows.length} equal lows`, kind: 'observed' },
      { claim: analysis.sweepDetected ? `Sweep of ${analysis.sweepDirection.replace('_', ' ')} liquidity` : 'No sweep detected', kind: 'inferred' },
      { claim: `Sweep probability ${(analysis.sweepProbability * 100).toFixed(0)}%`, kind: 'inferred' },
    ];

    const stopRunCandidates = [
      ...analysis.buySideLiquidity.filter((l) => l.strength !== 'low').map((l) => ({ level: l.level, side: 'buy_side' as const })),
      ...analysis.sellSideLiquidity.filter((l) => l.strength !== 'low').map((l) => ({ level: l.level, side: 'sell_side' as const })),
    ];

    const evidence: Evidence[] = [
      { key: 'liquidity_score', value: Number(analysis.liquidityScore.toFixed(3)) },
      { key: 'sweep_detected', value: analysis.sweepDetected, note: analysis.sweepDirection },
      { key: 'sweep_probability', value: Number(analysis.sweepProbability.toFixed(3)) },
      { key: 'stop_run_candidates', value: stopRunCandidates.length },
      { key: 'summary', value: analysis.summary },
    ];

    return {
      status: 'ok',
      result: { analysis, labelled, stopRunCandidates, orderBookAvailable: false },
      confidence: analysis.liquidityScore,
      evidence,
      warnings: ['Order-book depth is not provided by the configured data source; liquidity is inferred from price action'],
    };
  });
}
