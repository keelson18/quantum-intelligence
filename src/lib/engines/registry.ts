// ============================================================================
// Engine Registry — Master Prompt v1.0 §12 "Core Intelligence Engines"
// The 19 engines, their layer in the target architecture (§7) and execution
// order in the Master Decision pipeline (§24). This registry is the single
// source of truth for engine identity, versioning and UI presentation.
// ============================================================================

export type EngineLayer =
  | 'data'
  | 'market'
  | 'strategy'
  | 'risk'
  | 'portfolio'
  | 'knowledge'
  | 'decision'
  | 'review'
  | 'research';

export interface EngineDescriptor {
  /** Stable engine_name emitted in EngineResult. */
  id: string;
  /** 1..19 per spec §12. */
  order: number;
  label: string;
  layer: EngineLayer;
  version: string;
  responsibility: string;
}

export const ENGINE_REGISTRY: EngineDescriptor[] = [
  { id: 'data_quality', order: 1, label: 'Data Quality', layer: 'data', version: '1.0.0', responsibility: 'Validates freshness, gaps, OHLC integrity; blocks the pipeline when data is unusable.' },
  { id: 'market_context', order: 2, label: 'Market Context', layer: 'market', version: '1.0.0', responsibility: 'Support/resistance proximity, volatility and liquidity conditions, context penalty.' },
  { id: 'market_structure', order: 3, label: 'Market Structure', layer: 'market', version: '1.0.0', responsibility: 'Swings, HH/HL/LH/LL, break of structure, CHoCH, invalidation levels.' },
  { id: 'liquidity_intelligence', order: 4, label: 'Liquidity Intelligence', layer: 'market', version: '1.0.0', responsibility: 'Liquidity pools, equal highs/lows, sweeps and stop-run candidates (inferred, not order book).' },
  { id: 'pattern_intelligence', order: 5, label: 'Pattern Intelligence', layer: 'market', version: '1.0.0', responsibility: 'Candlestick and chart patterns, always context-qualified.' },
  { id: 'indicator_intelligence', order: 6, label: 'Indicator Intelligence', layer: 'market', version: '1.0.0', responsibility: 'Momentum, trend, volatility and volume indicators as evidence only.' },
  { id: 'market_regime', order: 7, label: 'Market Regime', layer: 'market', version: '1.0.0', responsibility: 'Classifies trending/ranging/volatile/breakout/transition with confidence.' },
  { id: 'strategy_intelligence', order: 8, label: 'Strategy Intelligence', layer: 'strategy', version: '1.0.0', responsibility: 'Versioned strategy candidates ranked against regime, structure and context.' },
  { id: 'historical_similarity', order: 9, label: 'Historical Similarity', layer: 'strategy', version: '1.0.0', responsibility: 'Finds analogous historical contexts and their forward outcomes with sample quality.' },
  { id: 'knowledge_intelligence', order: 10, label: 'Knowledge Intelligence', layer: 'knowledge', version: '1.0.0', responsibility: 'Institutional memory: validated observations, reaction levels and lessons.' },
  { id: 'ml_intelligence', order: 11, label: 'ML Intelligence', layer: 'strategy', version: '1.0.0', responsibility: 'Model predictions with version, probability and calibration lineage; never certainty.' },
  { id: 'ai_reasoning', order: 12, label: 'AI Reasoning', layer: 'knowledge', version: '1.0.0', responsibility: 'Non-authoritative synthesis of evidence into a reviewable narrative hypothesis.' },
  { id: 'risk_intelligence', order: 13, label: 'Risk Intelligence', layer: 'risk', version: '1.0.0', responsibility: 'Independent risk sizing, exposure, drawdown and circuit-breaker evaluation.' },
  { id: 'portfolio_intelligence', order: 14, label: 'Portfolio Intelligence', layer: 'portfolio', version: '1.0.0', responsibility: 'Exposure, concentration and correlation impact of accepting the setup.' },
  { id: 'master_decision', order: 15, label: 'Master Decision', layer: 'decision', version: '1.1.0', responsibility: 'Coordinates all evidence, contradictions and the risk gate into BUY/SELL/HOLD/WATCH/NO_TRADE.' },
  { id: 'explainability', order: 16, label: 'Explainability', layer: 'decision', version: '1.0.0', responsibility: 'Answers what happened, supporting/contradicting evidence, versions and invalidation.' },
  { id: 'trade_review', order: 17, label: 'Trade Review', layer: 'review', version: '1.0.0', responsibility: 'Post-trade classification of thesis, execution, risk and failure type.' },
  { id: 'learning_intelligence', order: 18, label: 'Learning Intelligence', layer: 'review', version: '1.0.0', responsibility: 'Controlled observation → hypothesis → validation pipeline; never silent rewrites.' },
  { id: 'research_intelligence', order: 19, label: 'Research Intelligence', layer: 'research', version: '1.0.0', responsibility: 'Backtests, walk-forward and robustness checks with bias guards.' },
];

/** Supporting engine used by the Master Decision Engine (spec §25). */
export const CONTRADICTION_DESCRIPTOR: EngineDescriptor = {
  id: 'contradiction_analysis',
  order: 15,
  label: 'Contradiction Analysis',
  layer: 'decision',
  version: '1.0.0',
  responsibility: 'Actively searches for disagreement between engines and downgrades or blocks the trade.',
};

export const LAYER_LABEL: Record<EngineLayer, string> = {
  data: 'Data',
  market: 'Market Intelligence',
  strategy: 'Strategy Intelligence',
  risk: 'Risk Intelligence',
  portfolio: 'Portfolio Intelligence',
  knowledge: 'Knowledge Intelligence',
  decision: 'Decision',
  review: 'Review & Learning',
  research: 'Research',
};

export function engineDescriptor(id: string): EngineDescriptor | undefined {
  return id === CONTRADICTION_DESCRIPTOR.id
    ? CONTRADICTION_DESCRIPTOR
    : ENGINE_REGISTRY.find((e) => e.id === id);
}
