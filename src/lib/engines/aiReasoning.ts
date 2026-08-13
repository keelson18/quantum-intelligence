// ============================================================================
// Engine 12 — AI Reasoning Engine (Master Prompt §12.12, §10, §11)
// Produces a NON-AUTHORITATIVE narrative hypothesis by synthesising the
// deterministic evidence already produced by the other engines. It cannot
// execute, size or approve a trade, and it never invents evidence.
// ============================================================================

import type { Side } from '../types';
import { runEngine, type EngineResult, type Evidence } from './contract';
import { ENGINE_REGISTRY } from './registry';
import type { MarketContextResult } from './marketContext';
import type { MarketStructureResult } from './marketStructure';
import type { LiquidityResult } from './liquidity';
import type { PatternResult } from './patternIntelligence';
import type { IndicatorResult } from './indicatorIntelligence';
import type { RegimeResult } from './marketRegime';
import type { StrategyResultBundle } from './strategyIntelligence';
import type { SimilarityResult } from './historicalSimilarity';
import type { KnowledgeResult } from './knowledgeIntelligence';
import type { MLResult } from './mlIntelligence';

const D = ENGINE_REGISTRY[11];

export type FactKind = 'observed_fact' | 'calculated_measurement' | 'model_prediction' | 'historical_evidence' | 'inferred_hypothesis';

export interface ReasoningStatement {
  kind: FactKind;
  text: string;
  source: string;
}

export interface ReasoningResult {
  narrative: string;
  statements: ReasoningStatement[];
  supporting: string[];
  opposing: string[];
  authoritative: false;
}

export interface ReasoningInputs {
  side: Side;
  symbol: string;
  context: MarketContextResult | null;
  structure: MarketStructureResult | null;
  liquidity: LiquidityResult | null;
  patterns: PatternResult | null;
  indicators: IndicatorResult | null;
  regime: RegimeResult | null;
  strategy: StrategyResultBundle | null;
  similarity: SimilarityResult | null;
  knowledge: KnowledgeResult | null;
  ml: MLResult | null;
}

export function aiReasoningEngine(contextId: string, input: ReasoningInputs): EngineResult<ReasoningResult> {
  return runEngine<ReasoningResult>(D.id, D.version, contextId, () => {
    const statements: ReasoningStatement[] = [];
    const supporting: string[] = [];
    const opposing: string[] = [];
    const bullish = input.side === 'buy';

    if (input.regime) {
      statements.push({ kind: 'calculated_measurement', text: `Regime is ${input.regime.label} (${input.regime.regimeClass}) with ADX ${input.regime.adx.toFixed(1)} and stability ${(input.regime.stability * 100).toFixed(0)}%.`, source: 'market_regime' });
      if (input.regime.regimeClass === 'transition' || input.regime.regimeClass === 'uncertain') opposing.push('Regime is unstable or unclassified');
    }
    if (input.structure) {
      const last = input.structure.events[input.structure.events.length - 1];
      statements.push({ kind: 'observed_fact', text: last ? `Last structural event: ${last.type} ${last.direction} at ${last.level.toFixed(2)}.` : 'No recent structural break.', source: 'market_structure' });
      if (last && ((bullish && last.direction === 'bullish') || (!bullish && last.direction === 'bearish'))) supporting.push(`Structure confirms ${last.direction} bias`);
    }
    if (input.context) {
      statements.push({ kind: 'calculated_measurement', text: input.context.context.summary, source: 'market_context' });
      if (input.side !== 'neutral' && input.context.higherTimeframeBias !== 'neutral') {
        const aligned = (bullish && input.context.higherTimeframeBias === 'bullish') || (!bullish && input.context.higherTimeframeBias === 'bearish');
        (aligned ? supporting : opposing).push(`Higher-timeframe bias is ${input.context.higherTimeframeBias}`);
      }
    }
    if (input.liquidity) {
      statements.push({ kind: 'inferred_hypothesis', text: input.liquidity.analysis.summary, source: 'liquidity_intelligence' });
    }
    if (input.patterns) {
      statements.push({ kind: 'observed_fact', text: `${input.patterns.patterns.length} pattern(s) detected; ${input.patterns.qualified.filter((q) => q.contextSupported).length} are context-supported. Volatility ${input.patterns.volatilityState}.`, source: 'pattern_intelligence' });
    }
    if (input.indicators) {
      statements.push({ kind: 'calculated_measurement', text: `Indicator balance: ${input.indicators.bullishWeight} bullish vs ${input.indicators.bearishWeight} bearish readings.`, source: 'indicator_intelligence' });
      const skew = input.indicators.bullishWeight - input.indicators.bearishWeight;
      if (input.side !== 'neutral') ((bullish && skew > 0) || (!bullish && skew < 0) ? supporting : opposing).push('Indicator balance');
    }
    if (input.strategy) {
      statements.push({ kind: 'calculated_measurement', text: `Selected strategy ${input.strategy.selected.label}: ${input.strategy.selected.reason}. ${input.strategy.rejectedCount} candidate(s) rejected.`, source: 'strategy_intelligence' });
    }
    if (input.similarity && input.similarity.sampleSize > 0) {
      statements.push({ kind: 'historical_evidence', text: `${input.similarity.sampleSize} analogous contexts: ${(input.similarity.upRate * 100).toFixed(0)}% resolved up, median ${input.similarity.medianForwardReturnPct.toFixed(2)}% (sample ${input.similarity.sampleQuality}).`, source: 'historical_similarity' });
      if (input.side !== 'neutral') {
        const favours = bullish ? input.similarity.upRate > input.similarity.downRate : input.similarity.downRate > input.similarity.upRate;
        (favours ? supporting : opposing).push('Historical analogues');
      }
    }
    if (input.knowledge) {
      for (const item of input.knowledge.items.slice(0, 3)) {
        statements.push({ kind: item.validated ? 'validated_observation' as unknown as FactKind : 'inferred_hypothesis', text: item.statement, source: `knowledge:${item.source}` });
      }
    }
    if (input.ml) {
      statements.push({ kind: 'model_prediction', text: `Model ${input.ml.modelVersion} predicts ${input.ml.prediction.prediction} at p=${input.ml.prediction.probability.toFixed(2)} (${input.ml.calibration} calibration).`, source: 'ml_intelligence' });
      if (input.side !== 'neutral') (input.ml.agreesWith ? supporting : opposing).push('Model direction');
    }

    if (statements.length === 0) {
      return { status: 'insufficient_data', result: null, confidence: 0, warnings: ['No evidence available to reason over'] };
    }

    const narrative = [
      `${input.symbol}: proposed stance ${input.side === 'neutral' ? 'NO DIRECTIONAL BIAS' : input.side.toUpperCase()}.`,
      ...statements.map((s) => s.text),
      supporting.length ? `Supporting: ${supporting.join('; ')}.` : 'No independent supporting evidence.',
      opposing.length ? `Opposing: ${opposing.join('; ')}.` : 'No opposing evidence detected.',
    ].join(' ');

    const evidence: Evidence[] = statements.map((s) => ({ key: s.kind, value: s.text, note: s.source }));
    const total = supporting.length + opposing.length;

    return {
      status: 'ok',
      result: { narrative, statements, supporting, opposing, authoritative: false },
      confidence: total === 0 ? 0 : Math.abs(supporting.length - opposing.length) / total,
      evidence,
      warnings: ['AI reasoning is advisory only and can never authorise or size a trade'],
    };
  });
}
