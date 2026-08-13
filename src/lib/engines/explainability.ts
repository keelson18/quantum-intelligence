// ============================================================================
// Engine 16 — Explainability Engine (Master Prompt §12.16, §29)
// Every decision must answer: what happened, what supports it, what
// contradicts it, which engines contributed, which strategy was selected,
// which alternatives were rejected, invalidation conditions, risks detected and
// which versions were used. Explanations reference REAL evidence only.
// ============================================================================

import type { TradeExplanation } from '../types';
import { runEngine, type EngineResult, type Evidence } from './contract';
import { ENGINE_REGISTRY } from './registry';
import type { EngineResult as ER } from './contract';

const D = ENGINE_REGISTRY[15];

export interface DecisionExplanation {
  whatHappened: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  contributingEngines: { engine: string; version: string; status: string; confidence: number }[];
  selectedStrategy: string | null;
  rejectedAlternatives: string[];
  invalidationConditions: string[];
  risksDetected: string[];
  versions: Record<string, string>;
  tradeExplanation: TradeExplanation | null;
}

export interface ExplainabilityInputs {
  action: string;
  confidence: number;
  engines: ER<unknown>[];
  selectedStrategy: string | null;
  rejectedAlternatives: string[];
  invalidationConditions: string[];
  risksDetected: string[];
  supporting: string[];
  contradicting: string[];
  tradeExplanation: TradeExplanation | null;
  versions: Record<string, string>;
}

export function explainabilityEngine(contextId: string, input: ExplainabilityInputs): EngineResult<DecisionExplanation> {
  return runEngine<DecisionExplanation>(D.id, D.version, contextId, () => {
    const contributingEngines = input.engines.map((e) => ({
      engine: e.engine_name,
      version: e.engine_version,
      status: e.status,
      confidence: e.confidence,
    }));

    const whatHappened = `Decision ${input.action} at ${(input.confidence * 100).toFixed(0)}% confidence, produced by ${contributingEngines.length} engine(s) over context ${contextId}.`;

    const explanation: DecisionExplanation = {
      whatHappened,
      supportingEvidence: input.supporting,
      contradictingEvidence: input.contradicting,
      contributingEngines,
      selectedStrategy: input.selectedStrategy,
      rejectedAlternatives: input.rejectedAlternatives,
      invalidationConditions: input.invalidationConditions,
      risksDetected: input.risksDetected,
      versions: input.versions,
      tradeExplanation: input.tradeExplanation,
    };

    const evidence: Evidence[] = [
      { key: 'engines_contributing', value: contributingEngines.length },
      { key: 'supporting_items', value: input.supporting.length },
      { key: 'contradicting_items', value: input.contradicting.length },
      { key: 'rejected_alternatives', value: input.rejectedAlternatives.length },
      { key: 'invalidation_conditions', value: input.invalidationConditions.length },
    ];

    const degraded = input.engines.filter((e) => e.status === 'failed' || e.status === 'insufficient_data');

    return {
      status: contributingEngines.length === 0 ? 'insufficient_data' : degraded.length > 0 ? 'degraded' : 'ok',
      result: explanation,
      confidence: contributingEngines.length === 0 ? 0 : 1 - degraded.length / contributingEngines.length,
      evidence,
      warnings: degraded.map((e) => `${e.engine_name} did not contribute (${e.status})`),
    };
  });
}
