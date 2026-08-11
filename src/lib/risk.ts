import type { Candle, Recommendation, RiskAssessment, Side } from './types';
import { atr, correlation } from './indicators';

// ============================================================================
// Risk Management Suite
// Dynamic position sizing (Kelly Criterion), daily loss / drawdown / exposure
// limits, correlation management, volatility-adjusted stops, risk/reward.
// ============================================================================

export interface PortfolioState {
  equity: number;           // current account equity (paper trading)
  startingEquity: number;
  dailyLossUsed: number;    // $ lost today
  maxDailyLossPct: number;  // e.g. 0.03 = 3%
  maxDrawdownPct: number;   // e.g. 0.20 = 20%
  peakEquity: number;
  currentExposurePct: number; // % of equity currently deployed
  maxExposurePct: number;     // max allowed
  openPositions: { symbol: string; value: number; side: Side }[];
}

export const DEFAULT_PORTFOLIO: PortfolioState = {
  equity: 100000,
  startingEquity: 100000,
  dailyLossUsed: 0,
  maxDailyLossPct: 0.03,
  maxDrawdownPct: 0.20,
  peakEquity: 100000,
  currentExposurePct: 0,
  maxExposurePct: 0.40,
  openPositions: [],
};

// Kelly Criterion: f* = (b*p - q) / b, where b = win/loss ratio, p = win prob, q = 1-p.
// We cap at 0.25 (quarter-Kelly) for safety — full Kelly is too volatile in practice.
export function kellyFraction(winProb: number, winLossRatio: number): number {
  if (winProb <= 0 || winLossRatio <= 0) return 0;
  const q = 1 - winProb;
  const f = (winLossRatio * winProb - q) / winLossRatio;
  return Math.max(0, Math.min(0.25, f)); // cap at quarter-Kelly
}

// Compute the full risk assessment for a potential trade.
export function assessRisk(
  candles: Candle[],
  side: Side,
  confidence: number,
  portfolio: PortfolioState,
  correlations?: { symbol: string; series: number[] }[],
): RiskAssessment | null {
  if (candles.length < 20 || side === 'neutral') return null;
  const a = atr(candles, 14);
  const atrVal = a[a.length - 1] || (candles[candles.length - 1].high - candles[candles.length - 1].low);
  const entry = candles[candles.length - 1].close;
  const dir = side === 'buy' ? 1 : -1;

  // Volatility-adjusted stop: 1.5×ATR. Take profit at 2:1 reward.
  const stopLoss = entry - dir * atrVal * 1.5;
  const takeProfit = entry + dir * atrVal * 3;
  const riskPerUnit = Math.abs(entry - stopLoss);
  const riskReward = Math.abs(takeProfit - entry) / (riskPerUnit || 1);

  // Kelly-based position sizing. Confidence → win prob; R:R → win/loss ratio.
  const winProb = Math.min(0.85, confidence);
  const kelly = kellyFraction(winProb, riskReward);
  const kellyEquity = portfolio.equity * kelly;
  const positionValue = kellyEquity;
  const positionSize = positionValue / entry;
  const riskPerTrade = positionSize * riskPerUnit;

  // ---- Limit checks ----
  const maxDailyLoss = portfolio.equity * portfolio.maxDailyLossPct;
  const remainingDailyLoss = maxDailyLoss - portfolio.dailyLossUsed;
  // If the risk per trade exceeds remaining daily loss budget, scale down.
  let cappedRisk = riskPerTrade;
  let cappedValue = positionValue;
  if (riskPerTrade > remainingDailyLoss && remainingDailyLoss > 0) {
    cappedRisk = remainingDailyLoss;
    cappedValue = (cappedRisk / riskPerUnit) * entry;
  }
  if (remainingDailyLoss <= 0) {
    cappedRisk = 0; cappedValue = 0;
  }

  // Drawdown check: if we're near the max drawdown limit, refuse new risk.
  const drawdown = (portfolio.peakEquity - portfolio.equity) / portfolio.peakEquity;
  const maxDrawdown = portfolio.equity * portfolio.maxDrawdownPct;
  if (drawdown >= portfolio.maxDrawdownPct) {
    cappedRisk = 0; cappedValue = 0;
  }

  // Exposure check: don't exceed max portfolio exposure.
  const newExposure = portfolio.currentExposurePct + (cappedValue / portfolio.equity);
  if (newExposure > portfolio.maxExposurePct) {
    const room = portfolio.maxExposurePct - portfolio.currentExposurePct;
    cappedValue = Math.max(0, room * portfolio.equity);
    cappedRisk = (cappedValue / entry) * riskPerUnit;
  }

  // Correlation management: warn if the new position is highly correlated to an open one.
  let correlationWarning: string | null = null;
  if (correlations && correlations.length) {
    const mySeries = candles.slice(-50).map((c) => c.close);
    for (const c of correlations) {
      const corr = correlation(mySeries, c.series.slice(-50));
      if (Math.abs(corr) > 0.7) {
        correlationWarning = `High correlation (${(corr * 100).toFixed(0)}%) with open ${c.symbol} — diversification risk`;
        break;
      }
    }
  }

  const reasoning = buildRiskReasoning(side, confidence, atrVal, riskReward, kelly, cappedValue, drawdown, portfolio);

  return {
    kellyFraction: kelly,
    positionSize: cappedValue > 0 ? cappedValue / entry : 0,
    positionValue: cappedValue,
    riskPerTrade: cappedRisk,
    stopLoss,
    takeProfit,
    entry,
    atr: atrVal,
    riskReward,
    maxDailyLoss,
    maxDrawdown,
    portfolioExposure: portfolio.currentExposurePct + (cappedValue / portfolio.equity),
    correlationWarning,
    reasoning,
  };
}

function buildRiskReasoning(
  side: Side, confidence: number, atrVal: number, rr: number, kelly: number,
  positionValue: number, drawdown: number, portfolio: PortfolioState,
): string {
  const parts: string[] = [];
  parts.push(`${side === 'buy' ? 'Long' : 'Short'} position with ${(confidence * 100).toFixed(0)}% confidence.`);
  parts.push(`Stop placed at 1.5×ATR (${atrVal.toFixed(2)}) for volatility-adjusted risk.`);
  parts.push(`Take profit at 2:1 reward (${rr.toFixed(2)}).`);
  parts.push(`Kelly fraction: ${(kelly * 100).toFixed(1)}% of equity → position value $${positionValue.toFixed(0)}.`);
  if (drawdown > 0.1) parts.push(`Warning: current drawdown ${(drawdown * 100).toFixed(1)}% approaching ${(portfolio.maxDrawdownPct * 100).toFixed(0)}% limit.`);
  if (portfolio.dailyLossUsed > 0) parts.push(`Daily loss budget: $${portfolio.dailyLossUsed.toFixed(0)} used of $${(portfolio.equity * portfolio.maxDailyLossPct).toFixed(0)}.`);
  parts.push(`Portfolio exposure after trade: ${((portfolio.currentExposurePct + positionValue / portfolio.equity) * 100).toFixed(1)}% (max ${(portfolio.maxExposurePct * 100).toFixed(0)}%).`);
  return parts.join(' ');
}

// Attach a risk assessment to a recommendation.
export function withRisk(rec: Recommendation, risk: RiskAssessment): Recommendation {
  return { ...rec, risk };
}
