// ============================================================================
// Engine 18 — Learning Engine (Master Prompt §12.18, §32)
// Learns from reviewed outcomes: strategy performance per regime, model
// reliability, indicator usefulness. Learning is EVIDENCE-BASED and never
// silently rewrites live behaviour — it emits proposals with sample sizes.
// ============================================================================

import { runEngine, type EngineResult, type Evidence } from './contract';
import { ENGINE_REGISTRY } from './registry';
import type { TradeReview, ClosedTradeInput } from './tradeReview';

const D = ENGINE_REGISTRY[17];

export interface LearningProposal {
  scope: 'strategy' | 'regime' | 'model' | 'risk';
  key: string;
  observation: string;
  sampleSize: number;
  suggestedWeightDelta: number; // -1..1, advisory only
  validated: boolean;
}

export interface LearningResult {
  proposals: LearningProposal[];
  overallWinRate: number;
  sampleSize: number;
  appliedAutomatically: false;
}

const MIN_SAMPLE = 10;

export function learningEngine(
  contextId: string,
  trades: ClosedTradeInput[],
  reviews: TradeReview[],
): EngineResult<LearningResult> {
  return runEngine<LearningResult>(D.id, D.version, contextId, () => {
    if (trades.length === 0) {
      return { status: 'insufficient_data', result: null, confidence: 0, warnings: ['No outcome history to learn from'] };
    }

    const byKey = (fn: (t: ClosedTradeInput) => string | null) => {
      const map = new Map<string, { wins: number; total: number }>();
      for (const t of trades) {
        const k = fn(t);
        if (!k) continue;
        const cur = map.get(k) ?? { wins: 0, total: 0 };
        cur.total += 1;
        if (t.pnl > 0) cur.wins += 1;
        map.set(k, cur);
      }
      return map;
    };

    const proposals: LearningProposal[] = [];
    const push = (scope: LearningProposal['scope'], map: Map<string, { wins: number; total: number }>, label: string) => {
      for (const [key, s] of map) {
        const rate = s.wins / s.total;
        proposals.push({
          scope,
          key,
          observation: `${label} "${key}" won ${s.wins}/${s.total} (${(rate * 100).toFixed(0)}%)`,
          sampleSize: s.total,
          suggestedWeightDelta: s.total >= MIN_SAMPLE ? Number(((rate - 0.5) * 2).toFixed(3)) : 0,
          validated: s.total >= MIN_SAMPLE,
        });
      }
    };

    push('strategy', byKey((t) => t.strategy ?? null), 'Strategy');
    push('regime', byKey((t) => t.regime ?? null), 'Regime');
    push('model', byKey((t) => (t.modelAgreed == null ? null : t.modelAgreed ? 'model_agreed' : 'model_disagreed')), 'Model alignment');

    const failureCounts = reviews.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.failureClass]: (acc[r.failureClass] ?? 0) + 1 }), {});
    for (const [cls, count] of Object.entries(failureCounts)) {
      if (cls === 'Correct Thesis') continue;
      proposals.push({
        scope: 'risk',
        key: cls,
        observation: `${count} trade(s) classified as ${cls}`,
        sampleSize: count,
        suggestedWeightDelta: 0,
        validated: count >= MIN_SAMPLE,
      });
    }

    const wins = trades.filter((t) => t.pnl > 0).length;
    const overallWinRate = wins / trades.length;
    const evidence: Evidence[] = [
      { key: 'sample_size', value: trades.length },
      { key: 'overall_win_rate', value: Number(overallWinRate.toFixed(3)) },
      ...proposals.slice(0, 20).map((p) => ({ key: `${p.scope}:${p.key}`, value: p.suggestedWeightDelta, note: p.observation })),
    ];

    return {
      status: trades.length < MIN_SAMPLE ? 'degraded' : 'ok',
      result: { proposals, overallWinRate, sampleSize: trades.length, appliedAutomatically: false },
      confidence: Math.min(1, trades.length / 50),
      evidence,
      warnings: trades.length < MIN_SAMPLE
        ? [`Sample of ${trades.length} is below the ${MIN_SAMPLE}-trade validation floor — proposals are unvalidated`]
        : ['Learning proposals are advisory; they never auto-modify risk limits'],
    };
  });
}
