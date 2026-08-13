// ============================================================================
// Engine 8 — Strategy Intelligence Engine (Master Prompt §12.8, §20)
// Produces VERSIONED strategy candidates and ranks them against regime,
// structure, volatility, liquidity and portfolio constraints. A strategy may be
// rejected even when it historically performs well.
// ============================================================================

import type { Candle, MLPrediction, Signal, StrategyEvaluation } from '../types';
import { evaluateStrategies } from '../strategies';
import { runEngine, type EngineResult, type Evidence } from './contract';
import { ENGINE_REGISTRY } from './registry';
import type { RegimeResult } from './marketRegime';

const D = ENGINE_REGISTRY[7];

export const STRATEGY_VERSIONS: Record<string, string> = {
  trend_following: '1.2.0',
  breakout: '1.1.0',
  mean_reversion: '1.1.0',
  momentum: '1.0.0',
  swing: '1.0.0',
  scalping: '1.0.0',
  position: '1.0.0',
  stat_arb: '1.0.0',
  pairs: '1.0.0',
  volatility: '1.0.0',
  smart_money: '1.1.0',
  hybrid_ai: '1.0.0',
};

export interface StrategyCandidate {
  name: string;
  version: string;
  side: Signal['side'];
  confidence: number;
  score: number;
  rejected: boolean;
  rejectionReason: string | null;
  reason: string;
}

export interface StrategyResultBundle {
  selected: StrategyEvaluation;
  candidates: StrategyCandidate[];
  allSignals: Signal[];
  rejectedCount: number;
}

const REGIME_UNSUITABLE: Record<string, string[]> = {
  ranging: ['breakout', 'trend', 'momentum'],
  trending: ['mean_reversion', 'reversion'],
  low_volatility: ['breakout', 'volatility'],
  high_volatility: ['scalping'],
};

export function strategyEngine(
  contextId: string,
  candles: Candle[],
  ml: MLPrediction | null,
  regime: RegimeResult | null,
): EngineResult<StrategyResultBundle> {
  return runEngine<StrategyResultBundle>(D.id, D.version, contextId, () => {
    if (candles.length < 60) {
      return { status: 'insufficient_data', result: null, confidence: 0, warnings: ['Insufficient history to evaluate strategies'] };
    }

    const { allSignals, selected } = evaluateStrategies(candles, ml);
    const unsuitable = regime ? REGIME_UNSUITABLE[regime.regimeClass] ?? [] : [];

    const candidates: StrategyCandidate[] = allSignals.map((s) => {
      const key = s.category || s.strategy.toLowerCase().replace(/\s+/g, '_');
      const clash = unsuitable.find((u) => key.includes(u) || s.strategy.toLowerCase().includes(u));
      const rejected = s.side === 'neutral' || Boolean(clash);
      return {
        name: s.strategy,
        version: STRATEGY_VERSIONS[key] ?? '1.0.0',
        side: s.side,
        confidence: s.confidence,
        score: s.side === 'buy' ? s.confidence : s.side === 'sell' ? -s.confidence : 0,
        rejected,
        rejectionReason: s.side === 'neutral'
          ? 'No directional signal'
          : clash
            ? `Strategy family unsuited to ${regime?.regimeClass} regime`
            : null,
        reason: s.reason,
      };
    }).sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

    const accepted = candidates.filter((c) => !c.rejected);
    const evidence: Evidence[] = [
      { key: 'selected_strategy', value: selected.label, note: `v${STRATEGY_VERSIONS[selected.name] ?? '1.0.0'} — ${selected.reason}` },
      { key: 'candidates', value: candidates.length },
      { key: 'accepted', value: accepted.length },
      { key: 'rejected', value: candidates.length - accepted.length },
      ...accepted.slice(0, 5).map((c) => ({ key: c.name, value: Number(c.score.toFixed(3)), note: c.reason })),
    ];

    return {
      status: accepted.length === 0 ? 'degraded' : 'ok',
      result: { selected, candidates, allSignals, rejectedCount: candidates.length - accepted.length },
      confidence: accepted.length === 0 ? 0 : selected.confidence * (regime ? Math.max(0.4, regime.stability) : 0.7),
      evidence,
      warnings: accepted.length === 0 ? ['Every strategy candidate was rejected for the current regime'] : [],
    };
  });
}
