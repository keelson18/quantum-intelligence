// ============================================================================
// Engine 17 — Trade Review Engine (Master Prompt §12.17, §31)
// Structured post-trade analysis: thesis, entry, exit, execution, risk, regime,
// evidence and outcome, with a failure classification.
// ============================================================================

import { runEngine, type EngineResult, type Evidence } from './contract';
import { ENGINE_REGISTRY } from './registry';

const D = ENGINE_REGISTRY[16];

export type FailureClass =
  | 'Correct Thesis'
  | 'Poor Execution'
  | 'Incorrect Thesis'
  | 'Risk Failure'
  | 'Data Failure'
  | 'Model Failure'
  | 'Strategy Mismatch'
  | 'Uncertain';

export interface ClosedTradeInput {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  entry: number;
  exit: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  pnl: number;
  pnlPct: number;
  exitReason: string;
  strategy?: string | null;
  aiConfidence?: number | null;
  regime?: string | null;
  dataQualityScore?: number | null;
  modelAgreed?: boolean | null;
  holdHours?: number | null;
}

export interface TradeReview {
  tradeId: string;
  outcome: 'win' | 'loss' | 'scratch';
  failureClass: FailureClass;
  thesisAssessment: string;
  executionAssessment: string;
  riskAssessment: string;
  lessons: string[];
  rMultiple: number | null;
}

export interface TradeReviewResult {
  reviews: TradeReview[];
  winRate: number;
  reviewed: number;
}

function classify(t: ClosedTradeInput, win: boolean): FailureClass {
  if ((t.dataQualityScore ?? 100) < 50) return 'Data Failure';
  if (win) return 'Correct Thesis';
  if (t.exitReason === 'stop_loss' && t.stopLoss == null) return 'Risk Failure';
  if (t.exitReason === 'manual' && (t.takeProfit != null || t.stopLoss != null)) return 'Poor Execution';
  if (t.modelAgreed === false) return 'Model Failure';
  if (t.regime && t.strategy && ['range_bound', 'low_volatility'].includes(t.regime) && /breakout|trend|momentum/i.test(t.strategy)) return 'Strategy Mismatch';
  if ((t.aiConfidence ?? 0) >= 0.7) return 'Incorrect Thesis';
  return 'Uncertain';
}

export function tradeReviewEngine(contextId: string, trades: ClosedTradeInput[]): EngineResult<TradeReviewResult> {
  return runEngine<TradeReviewResult>(D.id, D.version, contextId, () => {
    if (trades.length === 0) {
      return {
        status: 'insufficient_data',
        result: null,
        confidence: 0,
        warnings: ['No closed trades available to review'],
      };
    }

    const reviews: TradeReview[] = trades.map((t) => {
      const win = t.pnl > 0;
      const outcome: TradeReview['outcome'] = t.pnl > 0 ? 'win' : t.pnl < 0 ? 'loss' : 'scratch';
      const risk = t.stopLoss != null ? Math.abs(t.entry - t.stopLoss) : null;
      const rMultiple = risk && risk > 0 ? ((t.side === 'long' ? t.exit - t.entry : t.entry - t.exit) / risk) : null;
      const failureClass = classify(t, win);
      const lessons: string[] = [];
      if (failureClass === 'Poor Execution') lessons.push('Respect the planned exit levels instead of discretionary closes');
      if (failureClass === 'Risk Failure') lessons.push('Never open a position without a defined invalidation level');
      if (failureClass === 'Strategy Mismatch') lessons.push(`${t.strategy} is a poor fit for a ${t.regime} regime`);
      if (failureClass === 'Data Failure') lessons.push('Block execution when data quality is below the floor');
      if (rMultiple != null && rMultiple > 0 && rMultiple < 1) lessons.push('Winner closed below 1R — let planned targets work');

      return {
        tradeId: t.id,
        outcome,
        failureClass,
        thesisAssessment: `${t.side.toUpperCase()} ${t.symbol} via ${t.strategy ?? 'unspecified strategy'} at ${((t.aiConfidence ?? 0) * 100).toFixed(0)}% confidence → ${outcome}.`,
        executionAssessment: `Exited by ${t.exitReason} after ${t.holdHours != null ? `${t.holdHours.toFixed(1)}h` : 'unknown duration'} for ${t.pnlPct.toFixed(2)}%.`,
        riskAssessment: risk != null ? `Planned risk ${risk.toFixed(2)} per unit, realised ${rMultiple?.toFixed(2) ?? 'n/a'}R.` : 'No stop level recorded — risk was undefined.',
        lessons,
        rMultiple,
      };
    });

    const wins = reviews.filter((r) => r.outcome === 'win').length;
    const winRate = reviews.length ? wins / reviews.length : 0;
    const evidence: Evidence[] = [
      { key: 'reviewed', value: reviews.length },
      { key: 'win_rate', value: Number(winRate.toFixed(3)) },
      ...Object.entries(
        reviews.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.failureClass]: (acc[r.failureClass] ?? 0) + 1 }), {}),
      ).map(([k, v]) => ({ key: `class_${k.replace(/\s+/g, '_').toLowerCase()}`, value: v })),
    ];

    return {
      status: 'ok',
      result: { reviews, winRate, reviewed: reviews.length },
      confidence: Math.min(1, reviews.length / 20),
      evidence,
      warnings: reviews.length < 20 ? ['Fewer than 20 reviewed trades — conclusions are provisional'] : [],
    };
  });
}
