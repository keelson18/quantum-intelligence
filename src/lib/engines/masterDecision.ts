// ============================================================================
// Master Decision Engine — AI Engine Spec v1.1 §4
// Sequence: Data Quality -> Context -> Evidence -> Contradiction Search ->
// Strategy Ranking -> Historical/ML Evidence -> Portfolio -> Risk ->
// Decision -> Explanation -> Persistence.
//
// Allowed decisions: BUY, SELL, HOLD, WATCH, NO_TRADE. NO_TRADE is
// first-class: when evidence is missing or data quality is unacceptable the
// engine returns NO_TRADE rather than fabricating an output.
// ============================================================================

import type { Candle, MLPrediction, Timeframe } from '../types';
import { makeDecision, type DecisionResult } from '../decision';
import { DEFAULT_PORTFOLIO, type PortfolioState } from '../risk';
import { makeContextId, type EngineResult } from './contract';
import { dataQualityEngine, type DataQualityReport } from './dataQuality';
import { contradictionEngine, type ContradictionReport } from './contradictions';
import { riskGateEngine, DEFAULT_RISK_LIMITS, type RiskGateResult, type RiskLimits } from './riskGate';

export const MASTER_DECISION_VERSION = '1.0.0';

export type DecisionAction = 'BUY' | 'SELL' | 'HOLD' | 'WATCH' | 'NO_TRADE';

export interface MasterDecision {
  contextId: string;
  symbol: string;
  timeframe: Timeframe;
  action: DecisionAction;
  confidence: number; // 0..1 after contradiction penalties
  rawConfidence: number;
  /** Position size multiplier authorised by the risk gate (0 = no execution). */
  positionMultiplier: number;
  reasons: string[];
  decidedAt: string;
  engineVersions: Record<string, string>;
  /** Underlying analysis; null when data quality blocked the pipeline. */
  analysis: DecisionResult | null;
  engines: {
    dataQuality: EngineResult<DataQualityReport>;
    contradictions: EngineResult<ContradictionReport> | null;
    riskGate: EngineResult<RiskGateResult> | null;
  };
}

export interface MasterDecisionInput {
  candles: Candle[];
  symbol: string;
  timeframe: Timeframe;
  ml?: MLPrediction | null;
  portfolio?: PortfolioState;
  candleMap?: Partial<Record<Timeframe, Candle[]>>;
  correlationSeries?: { symbol: string; series: number[] }[];
  limits?: RiskLimits;
  now?: number;
}

export function runMasterDecision(input: MasterDecisionInput): MasterDecision {
  const {
    candles, symbol, timeframe, ml = null,
    portfolio = DEFAULT_PORTFOLIO, candleMap, correlationSeries,
    limits = DEFAULT_RISK_LIMITS, now = Date.now(),
  } = input;

  const lastBar = candles[candles.length - 1];
  const contextId = makeContextId(symbol, timeframe, lastBar?.time ?? 0);
  const engineVersions: Record<string, string> = { master_decision: MASTER_DECISION_VERSION };

  // 1. Data quality gate — a failure short-circuits to NO_TRADE.
  const dq = dataQualityEngine(contextId, candles, timeframe, now);
  engineVersions[dq.engine_name] = dq.engine_version;
  const quality = dq.result;

  if (!quality || !quality.usable) {
    return {
      contextId, symbol, timeframe,
      action: 'NO_TRADE',
      confidence: 0,
      rawConfidence: 0,
      positionMultiplier: 0,
      reasons: quality
        ? ['Data quality unacceptable', ...quality.issues.filter((i) => i.severity === 'critical').map((i) => i.detail)]
        : ['No market data available'],
      decidedAt: new Date(now).toISOString(),
      engineVersions,
      analysis: null,
      engines: { dataQuality: dq, contradictions: null, riskGate: null },
    };
  }

  // 2-7. Context, evidence, structure, patterns, strategies, ML, portfolio.
  const analysis = makeDecision(candles, ml, symbol, timeframe, portfolio, candleMap, correlationSeries);
  if (!analysis) {
    return {
      contextId, symbol, timeframe,
      action: 'NO_TRADE',
      confidence: 0,
      rawConfidence: 0,
      positionMultiplier: 0,
      reasons: ['Insufficient evidence to construct a decision'],
      decidedAt: new Date(now).toISOString(),
      engineVersions,
      analysis: null,
      engines: { dataQuality: dq, contradictions: null, riskGate: null },
    };
  }

  const rec = analysis.recommendation;
  const side = rec.side;
  const rawConfidence = analysis.institutional?.finalConfidence ?? Math.abs(rec.score);

  // 4. Contradiction search — evidence against the proposed trade.
  const contradictions = contradictionEngine(contextId, side, analysis.institutional, ml, quality, rec);
  engineVersions[contradictions.engine_name] = contradictions.engine_version;
  const cReport = contradictions.result ?? { contradictions: [], totalPenalty: 0, blocking: false };
  const confidence = Math.max(0, rawConfidence * (1 - cReport.totalPenalty));

  // 8. Risk gate — authoritative veto.
  const confluenceTotal = analysis.institutional?.confluence.total ?? null;
  const riskGate = riskGateEngine(
    contextId, side, confidence, rec, quality, cReport, confluenceTotal, portfolio.equity, limits,
  );
  engineVersions[riskGate.engine_name] = riskGate.engine_version;
  const gate = riskGate.result;

  // 9. Decision.
  let action: DecisionAction;
  const reasons: string[] = [];
  if (side === 'neutral') {
    action = confidence >= 0.25 ? 'WATCH' : 'HOLD';
    reasons.push('No directional edge established');
  } else if (gate?.approved) {
    action = side === 'buy' ? 'BUY' : 'SELL';
    reasons.push(`${confluenceTotal !== null ? `Confluence ${confluenceTotal.toFixed(0)}, ` : ''}confidence ${(confidence * 100).toFixed(0)}%`);
  } else if (cReport.blocking) {
    action = 'NO_TRADE';
    reasons.push(...cReport.contradictions.filter((c) => c.severity === 'high').map((c) => c.detail));
  } else {
    action = 'WATCH';
    reasons.push(gate?.reason ?? 'Risk gate did not approve execution');
  }
  for (const c of cReport.contradictions) {
    if (c.severity !== 'high') reasons.push(c.detail);
  }

  return {
    contextId, symbol, timeframe,
    action,
    confidence,
    rawConfidence,
    positionMultiplier: gate?.allowedMultiplier ?? 0,
    reasons,
    decidedAt: new Date(now).toISOString(),
    engineVersions,
    analysis,
    engines: { dataQuality: dq, contradictions, riskGate },
  };
}
