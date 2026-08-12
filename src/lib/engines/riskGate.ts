// ============================================================================
// Risk Gate — Architecture Bible v1.1 §9
// The Risk Gate is authoritative. No strategy, model, LLM, provider or UI can
// bypass it. Paper trading only: it never authorises real-money execution.
// ============================================================================

import type { Recommendation, Side } from '../types';
import { runEngine, type EngineResult } from './contract';
import type { ContradictionReport } from './contradictions';
import type { DataQualityReport } from './dataQuality';

export const RISK_GATE_VERSION = '1.0.0';

export interface RiskLimits {
  minConfluence: number;
  minRiskReward: number;
  maxPortfolioExposurePct: number;
  maxRiskPerTradePct: number;
  minDataQualityScore: number;
  minConfidence: number;
}

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  minConfluence: 40,
  minRiskReward: 1.2,
  maxPortfolioExposurePct: 60,
  maxRiskPerTradePct: 2,
  minDataQualityScore: 50,
  minConfidence: 0.35,
};

export interface RiskViolation {
  code: string;
  limit: number;
  actual: number;
  detail: string;
}

export interface RiskGateResult {
  approved: boolean;
  violations: RiskViolation[];
  /** Position multiplier the gate allows (0 when vetoed). */
  allowedMultiplier: number;
  reason: string;
}

export function evaluateRiskGate(
  side: Side,
  confidence: number,
  rec: Recommendation,
  quality: DataQualityReport,
  contradictions: ContradictionReport,
  confluenceTotal: number | null,
  equity: number,
  limits: RiskLimits = DEFAULT_RISK_LIMITS,
): RiskGateResult {
  const violations: RiskViolation[] = [];

  if (quality.score < limits.minDataQualityScore || !quality.usable) {
    violations.push({ code: 'data_quality', limit: limits.minDataQualityScore, actual: quality.score, detail: 'Market data quality is unacceptable for execution' });
  }
  if (confluenceTotal !== null && confluenceTotal < limits.minConfluence) {
    violations.push({ code: 'min_confluence', limit: limits.minConfluence, actual: confluenceTotal, detail: 'Confluence below execution floor' });
  }
  if (confidence < limits.minConfidence) {
    violations.push({ code: 'min_confidence', limit: limits.minConfidence, actual: confidence, detail: 'Final confidence below execution floor' });
  }
  if (rec.risk) {
    if (rec.risk.riskReward < limits.minRiskReward) {
      violations.push({ code: 'min_risk_reward', limit: limits.minRiskReward, actual: rec.risk.riskReward, detail: 'Risk/reward below minimum' });
    }
    const exposurePct = rec.risk.portfolioExposure * 100;
    if (exposurePct > limits.maxPortfolioExposurePct) {
      violations.push({ code: 'max_exposure', limit: limits.maxPortfolioExposurePct, actual: exposurePct, detail: 'Portfolio exposure limit exceeded' });
    }
    const riskPct = equity > 0 ? (rec.risk.riskPerTrade / equity) * 100 : 0;
    if (riskPct > limits.maxRiskPerTradePct) {
      violations.push({ code: 'max_risk_per_trade', limit: limits.maxRiskPerTradePct, actual: riskPct, detail: 'Risk per trade limit exceeded' });
    }
  } else if (side !== 'neutral') {
    violations.push({ code: 'missing_risk_assessment', limit: 1, actual: 0, detail: 'No risk assessment available for a directional setup' });
  }
  if (contradictions.blocking) {
    violations.push({ code: 'blocking_contradiction', limit: 0, actual: contradictions.contradictions.filter((c) => c.severity === 'high').length, detail: 'High-severity contradiction present' });
  }

  const approved = side !== 'neutral' && violations.length === 0;
  const allowedMultiplier = approved ? Math.min(1, Math.max(0.25, confidence)) : 0;
  return {
    approved,
    violations,
    allowedMultiplier,
    reason: approved
      ? 'All risk limits satisfied for paper execution'
      : violations.length === 0
        ? 'No directional setup to approve'
        : `Vetoed: ${violations.map((v) => v.detail).join('; ')}`,
  };
}

export function riskGateEngine(
  contextId: string,
  side: Side,
  confidence: number,
  rec: Recommendation,
  quality: DataQualityReport,
  contradictions: ContradictionReport,
  confluenceTotal: number | null,
  equity: number,
  limits: RiskLimits = DEFAULT_RISK_LIMITS,
): EngineResult<RiskGateResult> {
  return runEngine('risk_gate', RISK_GATE_VERSION, contextId, () => {
    const result = evaluateRiskGate(side, confidence, rec, quality, contradictions, confluenceTotal, equity, limits);
    return {
      status: 'ok' as const,
      result,
      confidence: result.approved ? confidence : 0,
      evidence: result.violations.map((v) => ({ key: v.code, value: v.actual, note: `${v.detail} (limit ${v.limit})` })),
      warnings: result.approved ? [] : [result.reason],
    };
  });
}
