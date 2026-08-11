import type { Candle, MLPrediction, Recommendation, RiskAssessment, PatternHit, Signal, Timeframe, InstitutionalAnalysis } from './types';
import { evaluateStrategies, collectOverlays } from './strategies';
import { assessRisk, DEFAULT_PORTFOLIO, type PortfolioState } from './risk';
import { detectAllPatterns } from './patterns';
import { explainTrade } from './explain';
import { runInstitutionalPipeline } from './institutionalEngine';

// ============================================================================
// Institutional Decision Engine
// Full pipeline:
//   Indicators → Patterns → Volume → Market Structure → Liquidity →
//   Regime Detection → Market Context → Multi-Timeframe → Confluence →
//   Trade Quality → Portfolio Intelligence → ML Models → Confidence →
//   Final Decision → BUY / SELL / HOLD
// ============================================================================

export interface DecisionResult {
  recommendation: Recommendation;
  allSignals: Signal[];
  patterns: PatternHit[];
  overlays: import('./types').Overlay[];
  regime: import('./types').Regime;
  selectedStrategy: import('./types').StrategyEvaluation;
  institutional: InstitutionalAnalysis | null;
}

export function makeDecision(
  candles: Candle[],
  ml: MLPrediction | null,
  symbol: string,
  timeframe: Timeframe,
  portfolio: PortfolioState = DEFAULT_PORTFOLIO,
  candleMap?: Partial<Record<Timeframe, Candle[]>>,
  correlationSeries?: { symbol: string; series: number[] }[],
): DecisionResult | null {
  if (candles.length < 60) return null;

  const { allSignals, selected, context } = evaluateStrategies(candles, ml);
  const patterns = detectAllPatterns(candles);

  // Build contributors from all non-neutral signals + ML.
  const contributors: Recommendation['contributors'] = allSignals
    .filter((s) => s.side !== 'neutral')
    .map((s) => ({
      source: s.strategy,
      side: s.side,
      weight: s.confidence,
      confidence: s.confidence,
      reason: s.reason,
    }));

  if (ml) {
    const mlWeight = ml.confidence === 'high' ? 0.8 : ml.confidence === 'medium' ? 0.6 : 0.4;
    contributors.push({
      source: `ML Model v${ml.model_version}`,
      side: ml.prediction === 'up' ? 'buy' : ml.prediction === 'down' ? 'sell' : 'neutral',
      weight: mlWeight,
      confidence: ml.probability,
      reason: `p=${ml.probability.toFixed(2)}, exp move ${ml.expected_move_pct.toFixed(2)}%`,
    });
  }

  // Weighted score from all contributors.
  let weighted = 0, totalWeight = 0;
  for (const c of contributors) {
    const val = c.side === 'buy' ? 1 : c.side === 'sell' ? -1 : 0;
    weighted += val * c.weight;
    totalWeight += c.weight;
  }
  const score = totalWeight > 0 ? weighted / totalWeight : 0;
  const side = score > 0.15 ? 'buy' : score < -0.15 ? 'sell' : 'neutral';

  // Risk assessment.
  let risk: RiskAssessment | undefined;
  if (side !== 'neutral') {
    const assessed = assessRisk(candles, side, Math.abs(score), portfolio);
    if (assessed) risk = assessed;
  }

  const rec: Recommendation = {
    symbol,
    timeframe,
    side,
    score,
    regime: context.structure.regime,
    selectedStrategy: selected.name,
    strategyLabel: selected.label,
    contributors,
    risk,
    updatedAt: Date.now(),
  };

  // Run institutional pipeline for confluence, trade grade, and evidence.
  const institutional = runInstitutionalPipeline(
    candles, candleMap ?? { [timeframe]: candles }, ml, symbol, timeframe,
    rec, patterns, portfolio, correlationSeries,
  );

  // Adjust confidence and score using institutional analysis.
  if (institutional) {
    const adjustedScore = side === 'buy' ? institutional.finalConfidence :
                          side === 'sell' ? -institutional.finalConfidence : 0;
    rec.score = adjustedScore;

    // Upgrade to HOLD if confluence is too low.
    if (institutional.confluence.total < 40 && side !== 'neutral') {
      rec.side = 'neutral';
      rec.score = 0;
    }

    // Scale position by portfolio intelligence multiplier.
    if (rec.risk && institutional.portfolioIntelligence) {
      const mult = institutional.portfolioIntelligence.suggestedPositionMultiplier;
      rec.risk = {
        ...rec.risk,
        positionValue: rec.risk.positionValue * mult,
        positionSize: rec.risk.positionSize * mult,
        riskPerTrade: rec.risk.riskPerTrade * mult,
      };
    }
  }

  // Explainable AI.
  rec.explanation = explainTrade(rec, candles, patterns, ml, institutional);

  // Collect chart overlays.
  const overlays = collectOverlays(allSignals, context, risk);

  return {
    recommendation: rec,
    allSignals,
    patterns,
    overlays,
    regime: context.structure.regime,
    selectedStrategy: selected,
    institutional,
  };
}
