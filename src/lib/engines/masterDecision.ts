// ============================================================================
// Master Decision Engine — AI Engine Spec v1.1 §4 / Master Prompt §12.15, §24
// Runs the full 19-engine pipeline in the spec-mandated order:
//  1 Data Quality -> 2 Market Context -> 3 Market Structure -> 4 Liquidity ->
//  5 Patterns -> 6 Indicators -> 7 Regime -> 8 Strategy -> 9 Historical
//  Similarity -> 10 Knowledge -> 11 ML -> 12 AI Reasoning -> 13 Risk ->
//  14 Portfolio -> 15 Master Decision (+ Contradiction Search) ->
//  16 Explainability -> 17 Trade Review -> 18 Learning -> 19 Research.
//
// Allowed decisions: BUY, SELL, HOLD, WATCH, NO_TRADE. NO_TRADE is
// first-class: when evidence is missing or data quality is unacceptable the
// engine returns NO_TRADE rather than fabricating an output.
// ============================================================================

import type { Candle, MLPrediction, Timeframe } from '../types';
import { makeDecision, type DecisionResult } from '../decision';
import { DEFAULT_PORTFOLIO, type PortfolioState } from '../risk';
import { analyzeLiquidity } from '../institutionalEngine';
import { makeContextId, type EngineResult } from './contract';
import { ENGINE_REGISTRY, CONTRADICTION_DESCRIPTOR, type EngineDescriptor } from './registry';
import { dataQualityEngine, type DataQualityReport } from './dataQuality';
import { contradictionEngine, type ContradictionReport } from './contradictions';
import { riskGateEngine, DEFAULT_RISK_LIMITS, type RiskGateResult, type RiskLimits } from './riskGate';
import { marketContextEngine, type MarketContextResult } from './marketContext';
import { marketStructureEngine, type MarketStructureResult } from './marketStructure';
import { liquidityEngine, type LiquidityResult } from './liquidity';
import { patternEngine, type PatternResult } from './patternIntelligence';
import { indicatorEngine, type IndicatorResult } from './indicatorIntelligence';
import { regimeEngine, type RegimeResult } from './marketRegime';
import { strategyEngine, type StrategyResultBundle } from './strategyIntelligence';
import { historicalSimilarityEngine, type SimilarityResult } from './historicalSimilarity';
import { knowledgeEngine, type KnowledgeResult } from './knowledgeIntelligence';
import { mlEngine, type MLResult } from './mlIntelligence';
import { aiReasoningEngine, type ReasoningResult } from './aiReasoning';
import { riskIntelligenceEngine, type RiskIntelligenceResult } from './riskIntelligence';
import { portfolioEngine, type PortfolioResult } from './portfolioIntelligence';
import { explainabilityEngine, type DecisionExplanation } from './explainability';
import { tradeReviewEngine, type TradeReviewResult, type ClosedTradeInput } from './tradeReview';
import { learningEngine, type LearningResult } from './learningIntelligence';
import { researchEngine, type ResearchResult } from './researchIntelligence';

export const MASTER_DECISION_VERSION = '1.1.0';

export type DecisionAction = 'BUY' | 'SELL' | 'HOLD' | 'WATCH' | 'NO_TRADE';

/** One executed pipeline step, presented in spec order with a short verdict. */
export interface EngineRun {
  descriptor: EngineDescriptor;
  result: EngineResult<unknown>;
  /** Human-readable one-line verdict for the dashboard. */
  verdict: string;
  /** True when the engine did not run because the pipeline halted earlier. */
  skipped: boolean;
}

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
  /** Full 19-engine breakdown in spec execution order. */
  pipeline: EngineRun[];
  engines: {
    dataQuality: EngineResult<DataQualityReport>;
    marketContext: EngineResult<MarketContextResult> | null;
    marketStructure: EngineResult<MarketStructureResult> | null;
    liquidity: EngineResult<LiquidityResult> | null;
    patterns: EngineResult<PatternResult> | null;
    indicators: EngineResult<IndicatorResult> | null;
    regime: EngineResult<RegimeResult> | null;
    strategy: EngineResult<StrategyResultBundle> | null;
    similarity: EngineResult<SimilarityResult> | null;
    knowledge: EngineResult<KnowledgeResult> | null;
    ml: EngineResult<MLResult> | null;
    reasoning: EngineResult<ReasoningResult> | null;
    riskIntelligence: EngineResult<RiskIntelligenceResult> | null;
    portfolio: EngineResult<PortfolioResult> | null;
    contradictions: EngineResult<ContradictionReport> | null;
    riskGate: EngineResult<RiskGateResult> | null;
    explainability: EngineResult<DecisionExplanation> | null;
    tradeReview: EngineResult<TradeReviewResult> | null;
    learning: EngineResult<LearningResult> | null;
    research: EngineResult<ResearchResult> | null;
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
  closedTrades?: ClosedTradeInput[];
  /** Research is offline evidence; disabled by default to keep the loop fast. */
  runResearch?: boolean;
  now?: number;
}

function descriptorOf(order: number): EngineDescriptor {
  return ENGINE_REGISTRY[order - 1]!;
}

function pending(descriptor: EngineDescriptor, reason: string): EngineRun {
  return {
    descriptor,
    skipped: true,
    verdict: reason,
    result: {
      engine_name: descriptor.id,
      engine_version: descriptor.version,
      timestamp: new Date().toISOString(),
      status: 'insufficient_data',
      result: null,
      confidence: 0,
      evidence: [],
      warnings: [reason],
      latency_ms: 0,
      input_context_id: '',
    },
  };
}

export function runMasterDecision(input: MasterDecisionInput): MasterDecision {
  const {
    candles, symbol, timeframe, ml = null,
    portfolio = DEFAULT_PORTFOLIO, candleMap, correlationSeries,
    limits = DEFAULT_RISK_LIMITS, closedTrades = [], runResearch = false, now = Date.now(),
  } = input;

  const lastBar = candles[candles.length - 1];
  const contextId = makeContextId(symbol, timeframe, lastBar?.time ?? 0);
  const engineVersions: Record<string, string> = { master_decision: MASTER_DECISION_VERSION };
  const pipeline: EngineRun[] = [];
  const push = (order: number, result: EngineResult<unknown>, verdict: string) => {
    engineVersions[result.engine_name] = result.engine_version;
    pipeline.push({ descriptor: descriptorOf(order), result, verdict, skipped: false });
  };

  // ---- Engine 1: Data Quality (blocking gate) ----------------------------
  const dq = dataQualityEngine(contextId, candles, timeframe, now);
  const quality = dq.result;
  push(1, dq, quality
    ? `${quality.score}/100 · ${quality.issues.length} issue(s) · ${quality.usable ? 'usable' : 'unusable'}`
    : 'No market data available');

  const halted = (reason: string, reasons: string[]): MasterDecision => {
    for (const d of ENGINE_REGISTRY.slice(1)) pipeline.push(pending(d, reason));
    pipeline.push(pending(CONTRADICTION_DESCRIPTOR, reason));
    return {
      contextId, symbol, timeframe,
      action: 'NO_TRADE',
      confidence: 0,
      rawConfidence: 0,
      positionMultiplier: 0,
      reasons,
      decidedAt: new Date(now).toISOString(),
      engineVersions,
      analysis: null,
      pipeline,
      engines: {
        dataQuality: dq, marketContext: null, marketStructure: null, liquidity: null,
        patterns: null, indicators: null, regime: null, strategy: null, similarity: null,
        knowledge: null, ml: null, reasoning: null, riskIntelligence: null, portfolio: null,
        contradictions: null, riskGate: null, explainability: null, tradeReview: null,
        learning: null, research: null,
      },
    };
  };

  if (!quality || !quality.usable) {
    return halted('Pipeline halted: data quality gate failed', quality
      ? ['Data quality unacceptable', ...quality.issues.filter((i) => i.severity === 'critical').map((i) => i.detail)]
      : ['No market data available']);
  }

  // 2-14 need the deterministic analysis substrate.
  const analysis = makeDecision(candles, ml, symbol, timeframe, portfolio, candleMap, correlationSeries);
  if (!analysis) {
    return halted('Pipeline halted: insufficient evidence', ['Insufficient evidence to construct a decision']);
  }

  const rec = analysis.recommendation;
  const side = rec.side;
  const rawConfidence = analysis.institutional?.finalConfidence ?? Math.abs(rec.score);

  // ---- Engine 4 substrate (liquidity analysis is needed by context) ------
  const liquidityRun = liquidityEngine(contextId, candles);
  const liquidityAnalysis = liquidityRun.result?.analysis ?? analysis.institutional?.liquidity ?? analyzeLiquidity(candles);

  // ---- Engine 2: Market Context -----------------------------------------
  const context = marketContextEngine(contextId, candles, timeframe, liquidityAnalysis, side, candleMap);
  push(2, context, context.result
    ? `HTF bias ${context.result.higherTimeframeBias} · exec ${context.result.executionTimeframe}`
    : 'Context unavailable');

  // ---- Engine 3: Market Structure ---------------------------------------
  const structure = marketStructureEngine(contextId, candles, timeframe);
  push(3, structure, structure.result
    ? `${structure.result.structure.regime} · ${structure.result.events.length} event(s)`
    : 'Structure unavailable');

  // ---- Engine 4: Liquidity ----------------------------------------------
  push(4, liquidityRun, liquidityRun.result
    ? `${liquidityRun.result.stopRunCandidates.length} stop-run level(s) · ${liquidityRun.result.analysis.sweepDetected ? 'sweep detected' : 'no sweep'}`
    : 'Liquidity map unavailable');

  // ---- Engine 7 substrate first: regime qualifies patterns/indicators ---
  const regime = regimeEngine(contextId, candles, analysis.regime);
  const granular = regime.result?.granular ?? analysis.institutional?.granularRegime ?? null;

  // ---- Engine 5: Patterns ----------------------------------------------
  const patterns = patternEngine(contextId, candles, granular, side);
  push(5, patterns, patterns.result
    ? `${patterns.result.qualified.length}/${patterns.result.patterns.length} context-supported · ${patterns.result.volatilityState}`
    : 'No patterns detected');

  // ---- Engine 6: Indicators --------------------------------------------
  const indicators = indicatorEngine(contextId, candles, granular);
  push(6, indicators, indicators.result
    ? `${indicators.result.bullishWeight.toFixed(1)} bull / ${indicators.result.bearishWeight.toFixed(1)} bear`
    : 'Indicators unavailable');

  // ---- Engine 7: Regime -------------------------------------------------
  push(7, regime, regime.result
    ? `${regime.result.label} · stability ${(regime.result.stability * 100).toFixed(0)}%`
    : 'Regime unclassified');

  // ---- Engine 8: Strategy ----------------------------------------------
  const strategy = strategyEngine(contextId, candles, ml, regime.result);
  push(8, strategy, strategy.result
    ? `${strategy.result.selected.label} selected · ${strategy.result.rejectedCount} rejected`
    : 'No strategy candidate qualified');

  // ---- Engine 9: Historical Similarity ---------------------------------
  const similarity = historicalSimilarityEngine(contextId, candles);
  push(9, similarity, similarity.result
    ? `${similarity.result.sampleSize} analogue(s) · ${similarity.result.sampleQuality} · up ${(similarity.result.upRate * 100).toFixed(0)}%`
    : 'No comparable history');

  // ---- Engine 10: Knowledge --------------------------------------------
  const knowledge = knowledgeEngine(contextId, candles, similarity.result);
  push(10, knowledge, knowledge.result
    ? `${knowledge.result.items.length} item(s) · ${knowledge.result.validatedCount} validated`
    : 'No institutional memory');

  // ---- Engine 11: ML ---------------------------------------------------
  const mlRun = mlEngine(contextId, ml, side, symbol, timeframe);
  push(11, mlRun, mlRun.result
    ? `${mlRun.result.prediction.prediction} @ ${(mlRun.result.prediction.probability * 100).toFixed(0)}% · ${mlRun.result.modelVersion}`
    : 'No model prediction available');

  // ---- Engine 12: AI Reasoning (non-authoritative) ---------------------
  const reasoning = aiReasoningEngine(contextId, {
    side, symbol,
    context: context.result,
    structure: structure.result,
    liquidity: liquidityRun.result,
    patterns: patterns.result,
    indicators: indicators.result,
    regime: regime.result,
    strategy: strategy.result,
    similarity: similarity.result,
    knowledge: knowledge.result,
    ml: mlRun.result,
  });
  push(12, reasoning, reasoning.result
    ? `${reasoning.result.supporting.length} for / ${reasoning.result.opposing.length} against (advisory only)`
    : 'No narrative produced');

  // ---- Contradiction Search (spec §25, supports Master Decision) -------
  const contradictions = contradictionEngine(contextId, side, analysis.institutional, ml, quality, rec);
  engineVersions[contradictions.engine_name] = contradictions.engine_version;
  const cReport = contradictions.result ?? { contradictions: [], totalPenalty: 0, blocking: false };
  const confidence = Math.max(0, rawConfidence * (1 - cReport.totalPenalty));

  // ---- Engine 13: Risk Intelligence + authoritative Risk Gate ----------
  const confluenceTotal = analysis.institutional?.confluence.total ?? null;
  const riskIntel = riskIntelligenceEngine(
    contextId, candles, side, confidence, rec, quality, cReport, confluenceTotal, portfolio, limits,
  );
  push(13, riskIntel, riskIntel.result
    ? `${riskIntel.result.approved ? 'approved' : 'blocked'} · risk score ${(riskIntel.result.riskScore * 100).toFixed(0)} · ${riskIntel.result.circuitBreakers.length} breaker(s)`
    : 'Risk assessment unavailable');

  // ---- Engine 14: Portfolio -------------------------------------------
  const portfolioRun = portfolioEngine(contextId, symbol, side, confidence, portfolio, candles, correlationSeries);
  push(14, portfolioRun, portfolioRun.result
    ? `exposure ${portfolioRun.result.exposurePct.toFixed(1)}% · ${portfolioRun.result.canAccept ? 'can accept' : portfolioRun.result.rejectionReason ?? 'cannot accept'}`
    : 'Portfolio state unavailable');

  const riskGate = riskGateEngine(
    contextId, side, confidence, rec, quality, cReport, confluenceTotal, portfolio.equity, limits,
  );
  engineVersions[riskGate.engine_name] = riskGate.engine_version;
  const gate = riskGate.result;

  // ---- Engine 15: Master Decision -------------------------------------
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

  // Spec §17 process order: contradictions (4) and risk constraints (8) are
  // evaluated BEFORE the decision (11), so they are presented in that order.
  pipeline.push({
    descriptor: CONTRADICTION_DESCRIPTOR,
    result: contradictions,
    verdict: `${cReport.contradictions.length} contradiction(s) · penalty ${(cReport.totalPenalty * 100).toFixed(0)}%${cReport.blocking ? ' · BLOCKING' : ''}`,
    skipped: false,
  });
  pipeline.push({
    descriptor: { id: 'risk_gate', order: 15, label: 'Risk Gate (authoritative)', layer: 'risk', version: riskGate.engine_version, responsibility: 'Final veto over execution and position size; cannot be bypassed.' },
    result: riskGate,
    verdict: gate ? `${gate.approved ? 'Approved' : 'Not approved'} · ${gate.reason}` : 'Risk gate did not run',
    skipped: false,
  });
  pipeline.push({
    descriptor: descriptorOf(15),
    result: {
      engine_name: 'master_decision',
      engine_version: MASTER_DECISION_VERSION,
      timestamp: new Date(now).toISOString(),
      status: 'ok',
      result: { action, confidence },
      confidence,
      evidence: [
        { key: 'action', value: action },
        { key: 'raw_confidence', value: Number(rawConfidence.toFixed(3)) },
        { key: 'contradiction_penalty', value: Number(cReport.totalPenalty.toFixed(3)) },
        { key: 'position_multiplier', value: Number((gate?.allowedMultiplier ?? 0).toFixed(2)) },
      ],
      warnings: [],
      latency_ms: 0,
      input_context_id: contextId,
    },
    verdict: `${action} · ${(confidence * 100).toFixed(0)}% · size ${(gate?.allowedMultiplier ?? 0).toFixed(2)}×`,
    skipped: false,
  });

  // ---- Engine 16: Explainability --------------------------------------
  const explain = explainabilityEngine(contextId, {
    action,
    confidence,
    engines: pipeline.map((p) => p.result),
    selectedStrategy: strategy.result?.selected.label ?? analysis.selectedStrategy.label ?? null,
    rejectedAlternatives: (strategy.result?.candidates ?? []).filter((c) => c.rejected).map((c) => `${c.name}: ${c.rejectionReason ?? 'rejected'}`),
    invalidationConditions: structure.result?.invalidationLevel != null
      ? [`Structural invalidation at ${structure.result.invalidationLevel}`]
      : [],
    risksDetected: (riskIntel.result?.circuitBreakers ?? []).map((b) => b.detail),
    supporting: reasoning.result?.supporting ?? [],
    contradicting: cReport.contradictions.map((c) => c.detail),
    tradeExplanation: null,
    versions: engineVersions,
  });
  push(16, explain, explain.result
    ? `${explain.result.contributingEngines.length} engine(s) explained · ${explain.result.rejectedAlternatives.length} alternative(s) rejected`
    : 'No explanation produced');

  // ---- Engine 17: Trade Review ----------------------------------------
  const review = tradeReviewEngine(contextId, closedTrades);
  push(17, review, review.result
    ? `${review.result.reviewed} trade(s) reviewed · win rate ${(review.result.winRate * 100).toFixed(0)}%`
    : 'No closed trades to review');

  // ---- Engine 18: Learning --------------------------------------------
  const learning = learningEngine(contextId, closedTrades, review.result?.reviews ?? []);
  push(18, learning, learning.result
    ? `${learning.result.proposals.length} proposal(s) · sample ${learning.result.sampleSize} · never auto-applied`
    : 'Insufficient sample for learning');

  // ---- Engine 19: Research --------------------------------------------
  const research = runResearch
    ? researchEngine(contextId, candles, symbol, timeframe, [strategy.result?.selected.label ?? analysis.selectedStrategy.label])
    : null;
  if (research) {
    push(19, research, research.result
      ? `${research.result.findings.length} finding(s) · ${research.result.findings.filter((f) => f.robust).length} robust out-of-sample`
      : 'No robust research evidence');
  } else {
    pipeline.push(pending(descriptorOf(19), 'Offline research not requested for this context'));
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
    pipeline,
    engines: {
      dataQuality: dq,
      marketContext: context,
      marketStructure: structure,
      liquidity: liquidityRun,
      patterns,
      indicators,
      regime,
      strategy,
      similarity,
      knowledge,
      ml: mlRun,
      reasoning,
      riskIntelligence: riskIntel,
      portfolio: portfolioRun,
      contradictions,
      riskGate,
      explainability: explain,
      tradeReview: review,
      learning,
      research,
    },
  };
}
