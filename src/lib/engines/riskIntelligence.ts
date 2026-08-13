// ============================================================================
// Engine 13 — Risk Intelligence Engine (Master Prompt §12.13, §27)
// Risk is INDEPENDENT from strategy. Evaluates risk per trade, position size,
// exposure, concentration, correlation, drawdown, daily loss, volatility,
// position limits and circuit breakers. A high-confidence trade can still be
// rejected. The authoritative veto lives in riskGate.ts.
// ============================================================================

import type { Candle, Recommendation, RiskAssessment, Side } from '../types';
import { assessRisk, type PortfolioState } from '../risk';
import { atr } from '../indicators';
import { runEngine, type EngineResult, type Evidence } from './contract';
import { ENGINE_REGISTRY } from './registry';
import { evaluateRiskGate, DEFAULT_RISK_LIMITS, type RiskGateResult, type RiskLimits } from './riskGate';
import type { ContradictionReport } from './contradictions';
import type { DataQualityReport } from './dataQuality';

const D = ENGINE_REGISTRY[12];

export interface CircuitBreaker {
  code: 'daily_loss' | 'max_drawdown' | 'position_limit' | 'volatility_spike';
  tripped: boolean;
  detail: string;
}

export interface RiskIntelligenceResult {
  assessment: RiskAssessment | null;
  gate: RiskGateResult;
  circuitBreakers: CircuitBreaker[];
  riskScore: number; // 0..1, higher = riskier
  approved: boolean;
  ruleVersion: string;
  requiredAdjustments: string[];
}

export function riskIntelligenceEngine(
  contextId: string,
  candles: Candle[],
  side: Side,
  confidence: number,
  rec: Recommendation,
  quality: DataQualityReport,
  contradictions: ContradictionReport,
  confluenceTotal: number | null,
  portfolio: PortfolioState,
  limits: RiskLimits = DEFAULT_RISK_LIMITS,
): EngineResult<RiskIntelligenceResult> {
  return runEngine<RiskIntelligenceResult>(D.id, D.version, contextId, () => {
    const assessment = side === 'neutral' ? null : assessRisk(candles, side, Math.max(0.01, confidence), portfolio) ?? null;
    const effectiveRec: Recommendation = assessment ? { ...rec, risk: assessment } : rec;
    const gate = evaluateRiskGate(side, confidence, effectiveRec, quality, contradictions, confluenceTotal, portfolio.equity, limits);

    const atrArr = atr(candles, 14);
    const close = candles[candles.length - 1]?.close ?? 0;
    const atrPct = close > 0 ? ((atrArr[atrArr.length - 1] ?? 0) / close) * 100 : 0;
    const dailyLossPct = portfolio.equity > 0 ? (portfolio.dailyLossUsed / portfolio.equity) * 100 : 0;
    const drawdownPct = portfolio.peakEquity > 0 ? ((portfolio.peakEquity - portfolio.equity) / portfolio.peakEquity) * 100 : 0;

    const circuitBreakers: CircuitBreaker[] = [
      { code: 'daily_loss', tripped: dailyLossPct >= portfolio.maxDailyLossPct, detail: `Daily loss ${dailyLossPct.toFixed(2)}% of ${portfolio.maxDailyLossPct}% budget` },
      { code: 'max_drawdown', tripped: drawdownPct >= portfolio.maxDrawdownPct, detail: `Drawdown ${drawdownPct.toFixed(2)}% vs ${portfolio.maxDrawdownPct}% limit` },
      { code: 'position_limit', tripped: portfolio.currentExposurePct >= portfolio.maxExposurePct, detail: `Exposure ${portfolio.currentExposurePct.toFixed(1)}% vs ${portfolio.maxExposurePct}% limit` },
      { code: 'volatility_spike', tripped: atrPct > 8, detail: `ATR ${atrPct.toFixed(2)}% of price` },
    ];
    const tripped = circuitBreakers.filter((c) => c.tripped);

    const requiredAdjustments: string[] = [];
    if (assessment && assessment.riskReward < limits.minRiskReward) requiredAdjustments.push(`Improve risk/reward to at least ${limits.minRiskReward}:1`);
    if (tripped.some((c) => c.code === 'position_limit')) requiredAdjustments.push('Reduce open exposure before adding risk');
    if (tripped.some((c) => c.code === 'volatility_spike')) requiredAdjustments.push('Reduce size for elevated volatility');

    const riskScore = Math.min(
      1,
      (tripped.length * 0.25) + (atrPct > 4 ? 0.2 : 0) + (gate.violations.length * 0.15) + (drawdownPct > 5 ? 0.15 : 0),
    );
    const approved = gate.approved && tripped.length === 0;

    const evidence: Evidence[] = [
      { key: 'gate_approved', value: gate.approved, note: gate.reason },
      { key: 'risk_score', value: Number(riskScore.toFixed(3)) },
      { key: 'atr_pct', value: Number(atrPct.toFixed(3)) },
      { key: 'daily_loss_pct', value: Number(dailyLossPct.toFixed(3)) },
      { key: 'drawdown_pct', value: Number(drawdownPct.toFixed(3)) },
      { key: 'exposure_pct', value: Number(portfolio.currentExposurePct.toFixed(2)) },
      ...gate.violations.map((v) => ({ key: v.code, value: v.actual, note: `${v.detail} (limit ${v.limit})` })),
      ...tripped.map((c) => ({ key: `breaker_${c.code}`, value: true, note: c.detail })),
    ];
    if (assessment) {
      evidence.push(
        { key: 'position_size', value: Number(assessment.positionSize.toFixed(6)) },
        { key: 'risk_per_trade', value: Number(assessment.riskPerTrade.toFixed(2)) },
        { key: 'risk_reward', value: Number(assessment.riskReward.toFixed(2)) },
        { key: 'stop_loss', value: Number(assessment.stopLoss.toFixed(2)) },
        { key: 'take_profit', value: Number(assessment.takeProfit.toFixed(2)) },
      );
    }

    return {
      status: 'ok',
      result: { assessment, gate, circuitBreakers, riskScore, approved, ruleVersion: D.version, requiredAdjustments },
      confidence: approved ? confidence : 0,
      evidence,
      warnings: approved ? [] : [gate.reason, ...tripped.map((c) => `Circuit breaker: ${c.detail}`)],
    };
  });
}
