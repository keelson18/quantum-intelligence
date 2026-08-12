// ============================================================================
// Contradiction Analysis Engine — AI Engine Spec v1.1 §5
// Actively searches for evidence AGAINST a proposed trade. Conflicting
// timeframes, incompatible regimes, weak samples and excessive exposure must
// reduce confidence or reject the setup.
// ============================================================================

import type { InstitutionalAnalysis, MLPrediction, Recommendation, Side } from '../types';
import { runEngine, type EngineResult } from './contract';
import type { DataQualityReport } from './dataQuality';

export const CONTRADICTION_VERSION = '1.0.0';

export interface Contradiction {
  code: string;
  severity: 'low' | 'medium' | 'high';
  detail: string;
  /** Confidence reduction applied by this contradiction (0..1). */
  penalty: number;
}

export interface ContradictionReport {
  contradictions: Contradiction[];
  totalPenalty: number; // 0..1
  blocking: boolean;    // a high-severity contradiction forbids execution
}

export function findContradictions(
  side: Side,
  institutional: InstitutionalAnalysis | null,
  ml: MLPrediction | null,
  quality: DataQualityReport,
  rec: Recommendation,
): ContradictionReport {
  const out: Contradiction[] = [];

  if (side !== 'neutral' && institutional) {
    const mtf = institutional.multiTimeframe;
    if (mtf.alignedDirection !== 'neutral' && mtf.alignedDirection !== side) {
      out.push({
        code: 'timeframe_conflict',
        severity: 'high',
        detail: `Higher-timeframe alignment favours ${mtf.alignedDirection.toUpperCase()} while the setup is ${side.toUpperCase()}`,
        penalty: 0.35,
      });
    } else if (mtf.alignmentScore < 0.4) {
      out.push({
        code: 'weak_timeframe_alignment',
        severity: 'medium',
        detail: `Timeframe alignment is weak (${(mtf.alignmentScore * 100).toFixed(0)}%)`,
        penalty: 0.15,
      });
    }

    const regime = institutional.granularRegime;
    const rangeBound = regime === 'range_bound' || regime === 'low_volatility' || regime === 'accumulation' || regime === 'distribution';
    if (rangeBound && institutional.marketContext.trendStrength > 0.6) {
      out.push({
        code: 'regime_incompatibility',
        severity: 'medium',
        detail: 'Range regime detected while trend-following evidence dominates',
        penalty: 0.15,
      });
    }

    if (institutional.confluence.total < 40) {
      out.push({
        code: 'low_confluence',
        severity: 'high',
        detail: `Confluence of ${institutional.confluence.total.toFixed(0)} is below the 40 execution floor`,
        penalty: 0.3,
      });
    }

    const pi = institutional.portfolioIntelligence;
    if (pi && (pi.correlationRisk === 'high' || pi.concentrationRisk === 'high')) {
      out.push({
        code: 'excessive_exposure',
        severity: 'high',
        detail: `Portfolio exposure is unsafe (correlation ${pi.correlationRisk}, concentration ${pi.concentrationRisk})`,
        penalty: 0.25,
      });
    }

    if (institutional.marketContext.contextPenalty > 0.4) {
      out.push({
        code: 'unfavourable_context',
        severity: 'medium',
        detail: institutional.marketContext.summary,
        penalty: 0.15,
      });
    }

    if (institutional.marketMemory.reactionScore < 0.2) {
      out.push({
        code: 'weak_historical_sample',
        severity: 'low',
        detail: 'Historical reaction at these levels is a weak sample',
        penalty: 0.08,
      });
    }
  }

  if (side !== 'neutral' && ml) {
    const mlSide: Side = ml.prediction === 'up' ? 'buy' : ml.prediction === 'down' ? 'sell' : 'neutral';
    if (mlSide !== 'neutral' && mlSide !== side && ml.confidence !== 'low') {
      out.push({
        code: 'model_disagreement',
        severity: 'medium',
        detail: `Model predicts ${ml.prediction} (p=${ml.probability.toFixed(2)}) against a ${side.toUpperCase()} setup`,
        penalty: 0.18,
      });
    }
  }

  if (!quality.usable) {
    out.push({
      code: 'data_quality_failure',
      severity: 'high',
      detail: `Data quality score ${quality.score} is unacceptable for execution`,
      penalty: 1,
    });
  } else if (quality.score < 80) {
    out.push({
      code: 'data_quality_degraded',
      severity: 'low',
      detail: `Data quality score ${quality.score} is degraded`,
      penalty: 0.1,
    });
  }

  if (side !== 'neutral' && rec.risk && rec.risk.riskReward < 1.2) {
    out.push({
      code: 'poor_risk_reward',
      severity: 'high',
      detail: `Risk/reward of ${rec.risk.riskReward.toFixed(2)} is below the 1.2 minimum`,
      penalty: 0.3,
    });
  }

  const totalPenalty = Math.min(1, out.reduce((s, c) => s + c.penalty, 0));
  return { contradictions: out, totalPenalty, blocking: out.some((c) => c.severity === 'high') };
}

export function contradictionEngine(
  contextId: string,
  side: Side,
  institutional: InstitutionalAnalysis | null,
  ml: MLPrediction | null,
  quality: DataQualityReport,
  rec: Recommendation,
): EngineResult<ContradictionReport> {
  return runEngine('contradiction_analysis', CONTRADICTION_VERSION, contextId, () => {
    const report = findContradictions(side, institutional, ml, quality, rec);
    return {
      status: 'ok' as const,
      result: report,
      confidence: 1 - report.totalPenalty,
      evidence: report.contradictions.map((c) => ({ key: c.code, value: c.severity, weight: c.penalty, note: c.detail })),
      warnings: report.contradictions.filter((c) => c.severity === 'high').map((c) => c.detail),
    };
  });
}
