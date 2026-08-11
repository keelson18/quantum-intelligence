import type { Candle, Recommendation, TradeExplanation, PatternHit, MLPrediction, InstitutionalAnalysis } from './types';
import { computeIndicators } from './indicators';
import { granularRegimeLabel } from './institutionalEngine';

// ============================================================================
// Explainable AI
// For every trade, produce a human-readable explanation covering:
// why the trade was taken, indicators involved, patterns detected, confidence,
// risk assessment, stop loss reasoning, take profit reasoning, alternative
// scenarios, multi-timeframe summary, regime summary, and confluence breakdown.
// ============================================================================

export function explainTrade(
  rec: Recommendation,
  candles: Candle[],
  patterns: PatternHit[],
  ml: MLPrediction | null,
  institutional?: InstitutionalAnalysis | null,
): TradeExplanation {
  const i = candles.length - 1;
  const ind = computeIndicators(candles);
  const close = candles[i].close;
  const rsi = ind.rsi[i];
  const macdHist = ind.macd.hist[i];
  const adx = ind.adx[i] ?? 0;

  // ---- Indicators involved ----
  const indicators: string[] = [];
  indicators.push(`RSI(14)=${rsi?.toFixed(1)}`);
  indicators.push(`MACD hist=${macdHist?.toFixed(4)}`);
  indicators.push(`ADX=${adx.toFixed(1)} (trend strength)`);
  indicators.push(`ATR=${ind.atr[i]?.toFixed(2)} (volatility)`);
  if (!isNaN(ind.ema[20][i])) indicators.push(`EMA20=${ind.ema[20][i].toFixed(2)}`);
  if (!isNaN(ind.ema[50][i])) indicators.push(`EMA50=${ind.ema[50][i].toFixed(2)}`);
  if (!isNaN(ind.bollinger.width[i])) indicators.push(`BB width=${ind.bollinger.width[i]?.toFixed(4)}`);

  // ---- Patterns detected ----
  const patternNames = patterns.map((p) => p.name);
  const relevantPatterns = patternNames.length > 0 ? patternNames : ['No strong patterns'];

  // ---- Why the trade was taken ----
  const direction = rec.side === 'buy' ? 'long' : rec.side === 'sell' ? 'short' : 'no position';
  const whyParts: string[] = [];
  whyParts.push(`Selected strategy: ${rec.strategyLabel} based on ${rec.regime} market regime.`);
  whyParts.push(`Signal direction: ${direction.toUpperCase()} with score ${rec.score.toFixed(3)}.`);
  if (rec.contributors.length > 0) {
    whyParts.push(`Top contributors: ${rec.contributors.slice(0, 5).map((c) => `${c.source} (${c.side})`).join(', ')}.`);
  } else {
    whyParts.push('No contributing signals.');
  }
  if (ml) {
    whyParts.push(`ML model agrees: ${ml.prediction} with ${(ml.probability * 100).toFixed(0)}% probability.`);
  }
  if (institutional) {
    whyParts.push(`Institutional grade: ${institutional.tradeGrade} (${institutional.confluence.total}/100 confluence, ${institutional.riskRating} risk).`);
    if (institutional.confluence.total < 50) {
      whyParts.push('Low confluence — signal downgraded to HOLD pending stronger setup.');
    }
  }
  const why = whyParts.join(' ');

  // ---- Risk assessment ----
  const riskAssessment = rec.risk?.reasoning ?? 'Risk assessment not available.';

  // ---- Stop loss reasoning ----
  const stopLossReason = rec.risk
    ? `Stop loss at ${rec.risk.stopLoss.toFixed(2)} = entry - 1.5×ATR (${rec.risk.atr.toFixed(2)}). This volatility-adjusted stop sits beyond typical noise to avoid premature exit while capping downside at $${rec.risk.riskPerTrade.toFixed(0)} risk.`
    : 'Stop loss not calculated (neutral signal).';

  // ---- Take profit reasoning ----
  const takeProfitReason = rec.risk
    ? `Take profit at ${rec.risk.takeProfit.toFixed(2)} = entry + 3×ATR, targeting ${rec.risk.riskReward.toFixed(1)}:1 reward-to-risk. Chosen to capture the expected move while maintaining positive expectancy.`
    : 'Take profit not calculated (neutral signal).';

  // ---- Alternative scenarios ----
  const alternatives: string[] = [];
  if (rec.side !== 'buy') alternatives.push(`If price breaks above ${(close * 1.02).toFixed(2)} with volume, a long entry would be triggered by the breakout strategy.`);
  if (rec.side !== 'sell') alternatives.push(`If price breaks below ${(close * 0.98).toFixed(2)}, the mean-reversion strategy may flag an oversold bounce.`);
  if (rec.regime === 'range') alternatives.push('In a ranging market, mean reversion is preferred; a regime shift to expansion would switch to breakout.');
  if (ml && ml.prediction !== (rec.side === 'buy' ? 'up' : rec.side === 'sell' ? 'down' : 'flat')) {
    alternatives.push(`ML model diverges (${ml.prediction}). Monitor for confirmation before committing full position size.`);
  }
  alternatives.push('If no confirmation within the next 3 candles, the signal weakens and position size should be reduced.');

  // ---- Multi-timeframe summary ----
  const multiTimeframeSummary = institutional?.multiTimeframe
    ? institutional.multiTimeframe.summary
    : undefined;

  // ---- Regime summary ----
  const regimeSummary = institutional
    ? `Granular regime: ${granularRegimeLabel(institutional.granularRegime)}. ` +
      institutional.marketContext.summary
    : undefined;

  return {
    why,
    indicators,
    patterns: relevantPatterns,
    confidence: rec.contributors.reduce((sum, c) => sum + c.confidence * c.weight, 0) / (rec.contributors.reduce((s, c) => s + c.weight, 0) || 1),
    riskAssessment,
    stopLossReason,
    takeProfitReason,
    alternatives,
    multiTimeframeSummary,
    regimeSummary,
    confluenceBreakdown: institutional?.confluence,
  };
}
