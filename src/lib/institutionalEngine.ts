import type {
  Candle, Timeframe, Regime, GranularRegime, Side,
  MultiTimeframeAnalysis, LiquidityAnalysis, ConfluenceBreakdown,
  MarketMemory, PortfolioIntelligence, MarketContext, InstitutionalAnalysis,
  Recommendation, PatternHit, MLPrediction,
} from './types';
import type { PortfolioState } from './risk';
import { computeIndicators, correlation, findSwings, atr as atrFn, adx as adxFn } from './indicators';
import { analyzeMarketStructure, analyzeSmartMoney } from './structure';
import { DEFAULT_PORTFOLIO } from './risk';

// ============================================================================
// Phase 8.1 — Multi-Timeframe Analysis Engine
// Analyzes trend alignment across Weekly → Daily → 4H → 1H → 15M
// ============================================================================

const MTF_ORDER: Timeframe[] = ['1d', '4h', '1h', '15m'];
const MTF_LABELS: Record<Timeframe, string> = {
  '1m': '1Min', '3m': '3Min', '5m': '5Min', '15m': '15Min', '30m': '30Min',
  '1h': '1H', '4h': '4H', '1d': 'Daily', '1w': 'Weekly', '1M': 'Monthly',
};

export function analyzeMultiTimeframe(
  candleMap: Partial<Record<Timeframe, Candle[]>>,
): MultiTimeframeAnalysis {
  const tfs = MTF_ORDER.filter((tf) => candleMap[tf] && candleMap[tf]!.length >= 30);
  if (tfs.length === 0) {
    return {
      timeframes: [],
      alignmentScore: 0,
      alignedDirection: 'neutral',
      summary: 'Insufficient data for multi-timeframe analysis',
    };
  }

  const tfResults = tfs.map((tf) => {
    const candles = candleMap[tf]!;
    const structure = analyzeMarketStructure(candles);
    const ind = computeIndicators(candles);
    const lastIdx = candles.length - 1;
    const rsi = ind.rsi[lastIdx] ?? 50;
    const adxVal = ind.adx[lastIdx] ?? 0;
    const ema20 = ind.ema[20][lastIdx] ?? 0;
    const ema50 = ind.ema[50][lastIdx] ?? 0;
    const close = candles[lastIdx].close;

    const granular = classifyGranularRegime(candles, structure.regime, adxVal);
    const trend: 'bullish' | 'bearish' | 'neutral' =
      structure.regime === 'trend_up' || (ema20 > ema50 && close > ema20) ? 'bullish' :
      structure.regime === 'trend_down' || (ema20 < ema50 && close < ema20) ? 'bearish' : 'neutral';

    const lastEvent = structure.events[structure.events.length - 1];
    const structLabel: 'bos_bullish' | 'bos_bearish' | 'choch_bullish' | 'choch_bearish' | 'none' =
      !lastEvent ? 'none' :
      lastEvent.type === 'BOS' && lastEvent.direction === 'bullish' ? 'bos_bullish' :
      lastEvent.type === 'BOS' && lastEvent.direction === 'bearish' ? 'bos_bearish' :
      lastEvent.type === 'CHoCH' && lastEvent.direction === 'bullish' ? 'choch_bullish' :
      lastEvent.type === 'CHoCH' && lastEvent.direction === 'bearish' ? 'choch_bearish' : 'none';

    const label = `${MTF_LABELS[tf]}: ${trend === 'bullish' ? 'Bullish' : trend === 'bearish' ? 'Bearish' : 'Neutral'} · ${granularRegimeLabel(granular)}`;

    return { timeframe: tf, regime: structure.regime, granularRegime: granular, trend, rsi, adx: adxVal, structure: structLabel, label };
  });

  // Score alignment: count how many timeframes agree on direction.
  const bullCount = tfResults.filter((t) => t.trend === 'bullish').length;
  const bearCount = tfResults.filter((t) => t.trend === 'bearish').length;
  const total = tfResults.length;
  const alignmentScore = total > 0 ? Math.max(bullCount, bearCount) / total : 0;
  const alignedDirection: Side =
    bullCount > bearCount && bullCount >= Math.ceil(total * 0.6) ? 'buy' :
    bearCount > bullCount && bearCount >= Math.ceil(total * 0.6) ? 'sell' : 'neutral';

  const summary = tfResults.map((t) => t.label).join(' → ') +
    ` | Alignment: ${(alignmentScore * 100).toFixed(0)}% (${alignedDirection === 'buy' ? 'Bullish' : alignedDirection === 'sell' ? 'Bearish' : 'Mixed'})`;

  return { timeframes: tfResults, alignmentScore, alignedDirection, summary };
}

// ============================================================================
// Phase 8.2 — Granular Market Regime Detection
// Classifies into 10 regimes: strong/weak uptrend/downtrend, range, breakout,
// accumulation, distribution, high/low volatility
// ============================================================================

export function classifyGranularRegime(
  candles: Candle[],
  baseRegime: Regime,
  adxVal: number,
): GranularRegime {
  if (candles.length < 30) return 'range_bound';
  const closes = candles.map((c) => c.close);
  const lastIdx = candles.length - 1;
  const close = closes[lastIdx];

  // Historical volatility: std dev of returns over last 20 bars
  const returns = closes.slice(-21).map((c, i) => i > 0 ? Math.log(c / closes[closes.length - 21 + i - 1]) : 0).slice(1);
  const meanRet = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / returns.length;
  const histVol = Math.sqrt(variance) * Math.sqrt(252) * 100; // annualized %

  const recent = candles.slice(-20);
  void recent;

  // Bollinger band squeeze check
  const bb = computeIndicators(candles).bollinger;
  const bbWidth = bb.width[lastIdx] ?? 0;
  const bbWidthLookback = bb.width.slice(Math.max(0, lastIdx - 50), lastIdx);
  const minBbWidth = bbWidthLookback.length > 0 ? Math.min(...bbWidthLookback) : bbWidth;
  const isSqueeze = bbWidth <= minBbWidth * 1.2;

  // Breakout: price beyond Donchian 20
  const donchianHigh = Math.max(...candles.slice(-21, -1).map((c) => c.high));
  const donchianLow = Math.min(...candles.slice(-21, -1).map((c) => c.low));
  const isBreakoutUp = close > donchianHigh;
  const isBreakoutDown = close < donchianLow;

  if (isBreakoutUp || isBreakoutDown) return 'breakout';
  if (isSqueeze && baseRegime === 'consolidation') return 'accumulation';

  if (baseRegime === 'trend_up') return adxVal > 30 ? 'strong_uptrend' : 'weak_uptrend';
  if (baseRegime === 'trend_down') return adxVal > 30 ? 'strong_downtrend' : 'weak_downtrend';

  if (baseRegime === 'range' || baseRegime === 'consolidation') {
    // Distinguish accumulation/distribution by volume pattern
    const volRecent = candles.slice(-10).reduce((s, c) => s + c.volume, 0) / 10;
    const volPrior = candles.slice(-30, -10).reduce((s, c) => s + c.volume, 0) / 20;
    const volRatio = volRecent / (volPrior || 1);
    if (volRatio > 1.3 && close > (donchianHigh + donchianLow) / 2) return 'accumulation';
    if (volRatio > 1.3 && close < (donchianHigh + donchianLow) / 2) return 'distribution';
    return 'range_bound';
  }

  if (baseRegime === 'expansion' || histVol > 5) return 'high_volatility';
  if (histVol < 1.5) return 'low_volatility';

  return 'range_bound';
}

export function granularRegimeLabel(r: GranularRegime): string {
  const labels: Record<GranularRegime, string> = {
    strong_uptrend: 'Strong Uptrend', weak_uptrend: 'Weak Uptrend',
    strong_downtrend: 'Strong Downtrend', weak_downtrend: 'Weak Downtrend',
    range_bound: 'Range Bound', breakout: 'Breakout',
    accumulation: 'Accumulation', distribution: 'Distribution',
    high_volatility: 'High Volatility', low_volatility: 'Low Volatility',
  };
  return labels[r];
}

// Regime-aware indicator interpretation: same RSI means different things
export function interpretIndicatorByRegime(
  indicator: 'rsi_overbought' | 'rsi_oversold' | 'macd_bullish' | 'macd_bearish',
  regime: GranularRegime,
): { side: Side; confidenceMultiplier: number; reason: string } {
  switch (indicator) {
    case 'rsi_overbought':
      if (regime === 'strong_uptrend' || regime === 'weak_uptrend')
        return { side: 'buy', confidenceMultiplier: 0.8, reason: 'RSI overbought in uptrend — momentum continuation, not reversal' };
      if (regime === 'range_bound')
        return { side: 'sell', confidenceMultiplier: 1.0, reason: 'RSI overbought in range — mean reversion likely' };
      return { side: 'sell', confidenceMultiplier: 0.6, reason: 'RSI overbought — potential reversal' };
    case 'rsi_oversold':
      if (regime === 'strong_downtrend' || regime === 'weak_downtrend')
        return { side: 'sell', confidenceMultiplier: 0.8, reason: 'RSI oversold in downtrend — momentum continuation, not bounce' };
      if (regime === 'range_bound')
        return { side: 'buy', confidenceMultiplier: 1.0, reason: 'RSI oversold in range — mean reversion likely' };
      return { side: 'buy', confidenceMultiplier: 0.6, reason: 'RSI oversold — potential bounce' };
    case 'macd_bullish':
      if (regime === 'strong_uptrend') return { side: 'buy', confidenceMultiplier: 1.2, reason: 'MACD bullish in strong uptrend — high probability continuation' };
      if (regime === 'range_bound') return { side: 'buy', confidenceMultiplier: 0.5, reason: 'MACD bullish in range — weak signal, may fail' };
      return { side: 'buy', confidenceMultiplier: 0.8, reason: 'MACD bullish crossover' };
    case 'macd_bearish':
      if (regime === 'strong_downtrend') return { side: 'sell', confidenceMultiplier: 1.2, reason: 'MACD bearish in strong downtrend — high probability continuation' };
      if (regime === 'range_bound') return { side: 'sell', confidenceMultiplier: 0.5, reason: 'MACD bearish in range — weak signal' };
      return { side: 'sell', confidenceMultiplier: 0.8, reason: 'MACD bearish crossover' };
  }
}

// ============================================================================
// Phase 8.3 — Liquidity Analysis Engine
// Detects equal highs/lows, liquidity pools, sweeps, inducement
// ============================================================================

export function analyzeLiquidity(candles: Candle[]): LiquidityAnalysis {
  if (candles.length < 30) {
    return { buySideLiquidity: [], sellSideLiquidity: [], equalHighs: [], equalLows: [], sweepDetected: false, sweepDirection: 'none', sweepProbability: 0, liquidityScore: 0, summary: 'Insufficient data' };
  }
  const { highs, lows } = findSwings(candles, 3, 3);
  const smc = analyzeSmartMoney(candles);
  const lastIdx = candles.length - 1;
  const close = candles[lastIdx].close;
  const recent = candles.slice(-20);

  // Buy-side liquidity: swing highs above current price (resting stops)
  const buySideLiquidity = highs
    .filter((h) => h.value > close)
    .slice(-5)
    .map((h) => {
      const touches = highs.filter((hh) => Math.abs(hh.value - h.value) / h.value < 0.005).length;
      const strength = touches >= 3 ? 'high' as const : touches >= 2 ? 'medium' as const : 'low' as const;
      return { level: h.value, strength };
    });

  // Sell-side liquidity: swing lows below current price
  const sellSideLiquidity = lows
    .filter((l) => l.value < close)
    .slice(-5)
    .map((l) => {
      const touches = lows.filter((ll) => Math.abs(ll.value - l.value) / l.value < 0.005).length;
      const strength = touches >= 3 ? 'high' as const : touches >= 2 ? 'medium' as const : 'low' as const;
      return { level: l.value, strength };
    });

  // Liquidity sweep: price wicks beyond a recent swing then closes back inside
  let sweepDetected = false;
  let sweepDirection: 'buy_side' | 'sell_side' | 'none' = 'none';
  const lastCandle = candles[lastIdx];
  const recentHigh = Math.max(...recent.slice(0, -1).map((c) => c.high));
  const recentLow = Math.min(...recent.slice(0, -1).map((c) => c.low));

  if (lastCandle.high > recentHigh && lastCandle.close < recentHigh) {
    sweepDetected = true;
    sweepDirection = 'buy_side';
  } else if (lastCandle.low < recentLow && lastCandle.close > recentLow) {
    sweepDetected = true;
    sweepDirection = 'sell_side';
  }

  // Sweep probability: based on liquidity pool proximity and volume
  const volSpike = lastCandle.volume > (recent.reduce((s, c) => s + c.volume, 0) / 20) * 1.3;
  const nearbyPool = sweepDirection === 'buy_side'
    ? buySideLiquidity.some((b) => Math.abs(b.level - recentHigh) / recentHigh < 0.005)
    : sweepDirection === 'sell_side'
    ? sellSideLiquidity.some((s) => Math.abs(s.level - recentLow) / recentLow < 0.005)
    : false;
  const sweepProbability = sweepDetected
    ? Math.min(0.9, 0.4 + (volSpike ? 0.25 : 0) + (nearbyPool ? 0.25 : 0))
    : 0;

  // Liquidity score: higher = more liquidity to sweep, better for smart-money entries
  const poolCount = buySideLiquidity.length + sellSideLiquidity.length;
  const equalCount = smc.equalHighs.length + smc.equalLows.length;
  const liquidityScore = Math.min(1, (poolCount * 0.12) + (equalCount * 0.15) + (sweepDetected ? 0.3 : 0));

  const summary = sweepDetected
    ? `${sweepDirection === 'buy_side' ? 'Buy-side' : 'Sell-side'} liquidity sweep detected (${(sweepProbability * 100).toFixed(0)}% probability)`
    : `${poolCount} liquidity pools, ${equalCount} equal levels — no sweep detected`;

  return {
    buySideLiquidity, sellSideLiquidity,
    equalHighs: smc.equalHighs, equalLows: smc.equalLows,
    sweepDetected, sweepDirection, sweepProbability, liquidityScore, summary,
  };
}

// ============================================================================
// Phase 8.4 — Confluence Engine
// Weighted multi-factor scoring on a 100-point scale
// ============================================================================

export interface ConfluenceInputs {
  trendScore: number;       // 0..1
  structureScore: number;   // 0..1
  indicatorScore: number;   // 0..1
  patternScore: number;     // 0..1
  volumeScore: number;      // 0..1
  liquidityScore: number;   // 0..1
  srScore: number;          // 0..1 — support/resistance alignment
  timeframeScore: number;   // 0..1 — multi-timeframe alignment
  riskScore: number;        // 0..1 — risk/reward quality
}

const CONFLUENCE_WEIGHTS = {
  trend: 20, structure: 15, indicators: 10, patterns: 15,
  volume: 10, liquidity: 20, supportResistance: 10, timeframeAlignment: 10, risk: 10,
};

export function scoreConfluence(inputs: ConfluenceInputs): ConfluenceBreakdown {
  const trend = Math.round(inputs.trendScore * CONFLUENCE_WEIGHTS.trend);
  const structure = Math.round(inputs.structureScore * CONFLUENCE_WEIGHTS.structure);
  const indicators = Math.round(inputs.indicatorScore * CONFLUENCE_WEIGHTS.indicators);
  const patterns = Math.round(inputs.patternScore * CONFLUENCE_WEIGHTS.patterns);
  const volume = Math.round(inputs.volumeScore * CONFLUENCE_WEIGHTS.volume);
  const liquidity = Math.round(inputs.liquidityScore * CONFLUENCE_WEIGHTS.liquidity);
  const supportResistance = Math.round(inputs.srScore * CONFLUENCE_WEIGHTS.supportResistance);
  const timeframeAlignment = Math.round(inputs.timeframeScore * CONFLUENCE_WEIGHTS.timeframeAlignment);
  const risk = Math.round(inputs.riskScore * CONFLUENCE_WEIGHTS.risk);
  const total = trend + structure + indicators + patterns + volume + liquidity + supportResistance + timeframeAlignment + risk;

  const grade: ConfluenceBreakdown['grade'] =
    total >= 90 ? 'A+' : total >= 80 ? 'A' : total >= 65 ? 'B' : total >= 50 ? 'C' : 'D';
  const tradeQuality: ConfluenceBreakdown['tradeQuality'] =
    total >= 90 ? 'Excellent' : total >= 80 ? 'Good' : total >= 65 ? 'Fair' : total >= 50 ? 'Poor' : 'Very Poor';

  return { trend, structure, indicators, patterns, volume, liquidity, supportResistance, timeframeAlignment, risk, total, grade, tradeQuality };
}

// ============================================================================
// Phase 8.5 — Trade Quality Engine
// Professional setup grading based on 8 factors
// ============================================================================

export function gradeTrade(
  confluence: ConfluenceBreakdown,
  confidence: number,
  riskReward: number,
  regimeAlignment: boolean,
): { grade: 'A+' | 'A' | 'B' | 'C' | 'D'; quality: string; riskRating: 'Low' | 'Medium' | 'High' } {
  // Blend confluence score with confidence and R:R
  const rrScore = Math.min(1, riskReward / 3) * 100;
  const blended = confluence.total * 0.5 + confidence * 100 * 0.3 + rrScore * 0.2 * (regimeAlignment ? 1 : 0.7);

  const grade = blended >= 90 ? 'A+' : blended >= 78 ? 'A' : blended >= 62 ? 'B' : blended >= 45 ? 'C' : 'D';
  const quality = blended >= 90 ? 'Excellent' : blended >= 78 ? 'Good' : blended >= 62 ? 'Fair' : blended >= 45 ? 'Poor' : 'Very Poor';
  const riskRating: 'Low' | 'Medium' | 'High' =
    blended >= 78 ? 'Low' : blended >= 55 ? 'Medium' : 'High';

  return { grade, quality, riskRating };
}

// ============================================================================
// Phase 8.6 — Market Memory Engine
// Remembers previous breakouts, rejections, failed patterns, historical S/R
// ============================================================================

export function analyzeMarketMemory(candles: Candle[], lookback = 90): MarketMemory {
  if (candles.length < 30) {
    return { rejections: [], failedBreakouts: [], historicalSupport: [], historicalResistance: [], reactionScore: 0, summary: 'Insufficient data' };
  }
  const data = candles.slice(-Math.min(lookback, candles.length));
  const { highs, lows } = findSwings(data, 3, 3);
  const close = data[data.length - 1].close;

  // Rejections: swing highs/lows where price reversed significantly (>= 1.5%)
  const rejections: { level: number; count: number; lastTime: number }[] = [];
  for (const h of highs) {
    const after = data.slice(h.index + 1, h.index + 6);
    if (after.length > 0) {
      const reversal = (h.value - Math.min(...after.map((c) => c.low))) / h.value;
      if (reversal > 0.015) {
        const existing = rejections.find((r) => Math.abs(r.level - h.value) / h.value < 0.01);
        if (existing) { existing.count++; existing.lastTime = h.time; }
        else rejections.push({ level: h.value, count: 1, lastTime: h.time });
      }
    }
  }
  for (const l of lows) {
    const after = data.slice(l.index + 1, l.index + 6);
    if (after.length > 0) {
      const reversal = (Math.max(...after.map((c) => c.high)) - l.value) / l.value;
      if (reversal > 0.015) {
        const existing = rejections.find((r) => Math.abs(r.level - l.value) / l.value < 0.01);
        if (existing) { existing.count++; existing.lastTime = l.time; }
        else rejections.push({ level: l.value, count: 1, lastTime: l.time });
      }
    }
  }

  // Failed breakouts: price broke a swing level then returned
  const failedBreakouts: { level: number; direction: 'up' | 'down'; count: number }[] = [];
  for (let i = 20; i < data.length - 3; i++) {
    const swingHigh = Math.max(...data.slice(i - 20, i).map((c) => c.high));
    const swingLow = Math.min(...data.slice(i - 20, i).map((c) => c.low));
    if (data[i].close > swingHigh && data[i + 3].close < swingHigh) {
      const existing = failedBreakouts.find((f) => f.direction === 'up' && Math.abs(f.level - swingHigh) / swingHigh < 0.01);
      if (existing) existing.count++;
      else failedBreakouts.push({ level: swingHigh, direction: 'up', count: 1 });
    }
    if (data[i].close < swingLow && data[i + 3].close > swingLow) {
      const existing = failedBreakouts.find((f) => f.direction === 'down' && Math.abs(f.level - swingLow) / swingLow < 0.01);
      if (existing) existing.count++;
      else failedBreakouts.push({ level: swingLow, direction: 'down', count: 1 });
    }
  }

  // Historical S/R: cluster swing levels
  const historicalResistance = highs.slice(-10).map((h) => h.value).filter((v) => v > close);
  const historicalSupport = lows.slice(-10).map((l) => l.value).filter((v) => v < close);

  // Reaction score: how many rejections are near current price (within 2%)
  const nearRejections = rejections.filter((r) => Math.abs(r.level - close) / close < 0.02);
  const reactionScore = Math.min(1, nearRejections.reduce((s, r) => s + r.count * 0.2, 0));

  const summary = reactionScore > 0.5
    ? `Strong historical reactions at current levels (${nearRejections.length} rejections nearby)`
    : reactionScore > 0.2
    ? `Moderate historical reactions (${nearRejections.length} rejections nearby)`
    : 'Limited historical reaction data at current levels';

  return { rejections: rejections.slice(0, 10), failedBreakouts: failedBreakouts.slice(0, 10), historicalSupport, historicalResistance, reactionScore, summary };
}

// ============================================================================
// Phase 8.7 — Portfolio Intelligence Engine
// Evaluates new trades in context of existing positions
// ============================================================================

export function assessPortfolioIntelligence(
  symbol: string,
  side: Side,
  confidence: number,
  portfolio: PortfolioState,
  correlationSeries?: { symbol: string; series: number[] }[],
  newCandles?: Candle[],
): PortfolioIntelligence {
  const totalExposure = portfolio.currentExposurePct;
  const positionCount = portfolio.openPositions.length;

  // Correlation risk
  let maxCorr = 0;
  if (correlationSeries && newCandles) {
    const mySeries = newCandles.slice(-50).map((c) => c.close);
    for (const c of correlationSeries) {
      if (c.symbol === symbol) continue;
      const corr = correlation(mySeries, c.series.slice(-50));
      if (Math.abs(corr) > maxCorr) maxCorr = Math.abs(corr);
    }
  }
  const correlationRisk: 'low' | 'medium' | 'high' =
    maxCorr > 0.7 ? 'high' : maxCorr > 0.4 ? 'medium' : 'low';

  // Concentration risk: too many positions or over-exposure
  const concentrationRisk: 'low' | 'medium' | 'high' =
    totalExposure > 0.35 || positionCount >= 5 ? 'high' :
    totalExposure > 0.2 || positionCount >= 3 ? 'medium' : 'low';

  let multiplier = 1.0;
  const parts: string[] = [];

  if (correlationRisk === 'high') {
    multiplier *= 0.5;
    parts.push(`High correlation (${(maxCorr * 100).toFixed(0)}%) with existing positions — reduce size by 50%`);
  } else if (correlationRisk === 'medium') {
    multiplier *= 0.75;
    parts.push(`Moderate correlation — reduce size by 25%`);
  }

  if (concentrationRisk === 'high') {
    multiplier *= 0.6;
    parts.push(`High concentration (${(totalExposure * 100).toFixed(0)}% exposure, ${positionCount} positions) — reduce size`);
  } else if (concentrationRisk === 'medium') {
    multiplier *= 0.85;
    parts.push(`Moderate concentration — slightly reduce size`);
  }

  if (parts.length === 0) parts.push('Portfolio conditions favorable — standard position size');

  return {
    totalExposure,
    positionCount,
    correlationRisk,
    concentrationRisk,
    recommendation: parts.join('. '),
    suggestedPositionMultiplier: multiplier,
  };
}

// ============================================================================
// Phase 8.8 — Correlation Engine
// ============================================================================

export function computeCorrelationMatrix(
  seriesMap: Record<string, number[]>,
): { symbols: string[]; matrix: number[][] } {
  const symbols = Object.keys(seriesMap);
  const matrix: number[][] = [];
  for (let i = 0; i < symbols.length; i++) {
    const row: number[] = [];
    for (let j = 0; j < symbols.length; j++) {
      row.push(i === j ? 1 : correlation(seriesMap[symbols[i]], seriesMap[symbols[j]]));
    }
    matrix.push(row);
  }
  return { symbols, matrix };
}

// ============================================================================
// Phase 8.9 — Market Context Engine
// Evaluates nearby S/R, volatility, liquidity, trend before signal
// ============================================================================

export function analyzeMarketContext(
  candles: Candle[],
  liquidity: LiquidityAnalysis,
  granularRegime: GranularRegime,
  side: Side,
): MarketContext {
  const lastIdx = candles.length - 1;
  const close = candles[lastIdx].close;
  const { highs, lows } = findSwings(candles, 3, 3);

  // Nearest resistance: closest swing high above price
  const resistanceLevels = highs.filter((h) => h.value > close).map((h) => h.value);
  const nearestResistance = resistanceLevels.length > 0
    ? { level: resistanceLevels.reduce((min, v) => v < min ? v : min, Infinity), distancePct: 0 }
    : null;
  if (nearestResistance) nearestResistance.distancePct = (nearestResistance.level - close) / close * 100;

  // Nearest support: closest swing low below price
  const supportLevels = lows.filter((l) => l.value < close).map((l) => l.value);
  const nearestSupport = supportLevels.length > 0
    ? { level: supportLevels.reduce((max, v) => v > max ? v : max, -Infinity), distancePct: 0 }
    : null;
  if (nearestSupport) nearestSupport.distancePct = (close - nearestSupport.level) / close * 100;

  // Volatility condition
  const a = atrFn(candles, 14);
  const atrPct = (a[lastIdx] ?? 0) / close * 100;
  const volatilityCondition: 'high' | 'moderate' | 'low' =
    atrPct > 3 ? 'high' : atrPct > 1.5 ? 'moderate' : 'low';

  // Liquidity condition
  const liquidityCondition: 'high' | 'moderate' | 'low' =
    liquidity.liquidityScore > 0.6 ? 'high' : liquidity.liquidityScore > 0.3 ? 'moderate' : 'low';

  // Trend strength
  const adxArr = adxFn(candles, 14);
  const trendStrength = (adxArr[lastIdx] ?? 0) / 50;

  // Context penalty: reduce confidence if signal direction faces nearby S/R
  let contextPenalty = 0;
  const parts: string[] = [];

  if (side === 'buy' && nearestResistance && nearestResistance.distancePct < 0.5) {
    contextPenalty += 0.15;
    parts.push(`Resistance ${nearestResistance.distancePct.toFixed(1)}% away — buying into resistance`);
  }
  if (side === 'sell' && nearestSupport && nearestSupport.distancePct < 0.5) {
    contextPenalty += 0.15;
    parts.push(`Support ${nearestSupport.distancePct.toFixed(1)}% away — selling into support`);
  }
  if (volatilityCondition === 'high') {
    contextPenalty += 0.05;
    parts.push('High volatility increases stop-out risk');
  }
  if (liquidityCondition === 'low') {
    contextPenalty += 0.05;
    parts.push('Low liquidity — poor fill quality expected');
  }
  if (liquidity.sweepDetected) {
    if ((side === 'buy' && liquidity.sweepDirection === 'sell_side') || (side === 'sell' && liquidity.sweepDirection === 'buy_side')) {
      parts.push('Liquidity sweep confirms entry direction');
    } else {
      contextPenalty += 0.1;
      parts.push('Liquidity sweep against signal direction');
    }
  }

  if (parts.length === 0) parts.push('Market context favorable for signal');
  const summary = parts.join('. ');

  return {
    nearestResistance, nearestSupport,
    volatilityCondition, liquidityCondition,
    trendStrength, regime: granularRegime,
    contextPenalty: Math.min(0.4, contextPenalty),
    summary,
  };
}

// ============================================================================
// Phase 8.10 — Institutional Decision Engine
// Full pipeline: aggregates all engines into final decision with evidence
// ============================================================================

export function runInstitutionalPipeline(
  candles: Candle[],
  candleMap: Partial<Record<Timeframe, Candle[]>>,
  ml: MLPrediction | null,
  symbol: string,
  timeframe: Timeframe,
  baseRecommendation: Recommendation,
  patterns: PatternHit[],
  portfolio: PortfolioState = DEFAULT_PORTFOLIO,
  correlationSeries?: { symbol: string; series: number[] }[],
): InstitutionalAnalysis | null {
  if (candles.length < 60) return null;

  // 1. Multi-timeframe
  const multiTimeframe = analyzeMultiTimeframe(candleMap);

  // 2. Granular regime
  const ind = computeIndicators(candles);
  const lastIdx = candles.length - 1;
  const adxVal = ind.adx[lastIdx] ?? 0;
  const structure = analyzeMarketStructure(candles);
  const granularRegime = classifyGranularRegime(candles, structure.regime, adxVal);

  // 3. Liquidity
  const liquidity = analyzeLiquidity(candles);

  // 4. Volume analysis
  const recentVol = candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
  const priorVol = candles.slice(-50, -20).reduce((s, c) => s + c.volume, 0) / 30;
  const volRatio = recentVol / (priorVol || 1);
  const volumeSpike = candles[lastIdx].volume > recentVol * 1.5;
  const volumeScore = Math.min(1, (volRatio > 1.5 ? 0.6 : volRatio > 1.1 ? 0.4 : 0.2) + (volumeSpike ? 0.3 : 0));

  // 5. Market memory
  const marketMemory = analyzeMarketMemory(candles);

  // 6. Market context
  const side = baseRecommendation.side;
  const marketContext = analyzeMarketContext(candles, liquidity, granularRegime, side);

  // 7. Portfolio intelligence
  const portfolioIntelligence = assessPortfolioIntelligence(symbol, side, Math.abs(baseRecommendation.score), portfolio, correlationSeries, candles);

  // 8. Confluence scoring
  const trendScore = structure.trendStrength;
  const structureScore = structure.events.length > 0 ? Math.min(1, 0.5 + structure.events.length * 0.15) : 0.3;
  const rsi = ind.rsi[lastIdx] ?? 50;
  const macdHist = ind.macd.hist[lastIdx] ?? 0;
  const indicatorScore = Math.min(1, Math.abs(rsi - 50) / 30 + Math.abs(macdHist) / (ind.atr[lastIdx] || 1) * 0.3);
  const patternScore = patterns.length > 0 ? Math.min(1, patterns.reduce((s, p) => s + p.confidence, 0)) : 0.1;
  const srScore = marketContext.nearestSupport && marketContext.nearestResistance
    ? 1 - Math.min(1, (marketContext.nearestSupport.distancePct + marketContext.nearestResistance.distancePct) / 10)
    : 0.3;
  const riskScore = baseRecommendation.risk ? Math.min(1, baseRecommendation.risk.riskReward / 3) : 0.3;

  const confluence = scoreConfluence({
    trendScore, structureScore, indicatorScore, patternScore,
    volumeScore, liquidityScore: liquidity.liquidityScore,
    srScore, timeframeScore: multiTimeframe.alignmentScore, riskScore,
  });

  // 9. Confidence adjustment
  const baseConfidence = Math.abs(baseRecommendation.score);
  const contextPenalty = marketContext.contextPenalty;
  // Portfolio intelligence is used in the return value and evidence below.
  const mtfBonus = multiTimeframe.alignedDirection === side && side !== 'neutral' ? 0.1 : 0;
  const mtfPenalty = multiTimeframe.alignedDirection !== 'neutral' && multiTimeframe.alignedDirection !== side ? 0.1 : 0;
  const memoryBonus = marketMemory.reactionScore > 0.5 ? 0.05 : 0;
  const liquidityBonus = liquidity.sweepDetected &&
    ((side === 'buy' && liquidity.sweepDirection === 'sell_side') || (side === 'sell' && liquidity.sweepDirection === 'buy_side'))
    ? 0.08 : 0;

  const finalConfidence = Math.max(0, Math.min(1,
    baseConfidence + mtfBonus + liquidityBonus + memoryBonus - contextPenalty - mtfPenalty,
  ));

  // 10. Trade grade
  const rr = baseRecommendation.risk?.riskReward ?? 1.5;
  const regimeAlignment = side === 'buy'
    ? granularRegime === 'strong_uptrend' || granularRegime === 'weak_uptrend' || granularRegime === 'accumulation'
    : side === 'sell'
    ? granularRegime === 'strong_downtrend' || granularRegime === 'weak_downtrend' || granularRegime === 'distribution'
    : true;
  const gradeResult = gradeTrade(confluence, finalConfidence, rr, regimeAlignment);

  // 11. Evidence
  const evidence: string[] = [];
  evidence.push(`Regime: ${granularRegimeLabel(granularRegime)}`);
  evidence.push(`Multi-timeframe alignment: ${(multiTimeframe.alignmentScore * 100).toFixed(0)}% (${multiTimeframe.alignedDirection})`);
  evidence.push(`Confluence: ${confluence.total}/100 (Grade ${confluence.grade})`);
  evidence.push(`Liquidity: ${liquidity.summary}`);
  evidence.push(`Volume: ${volumeSpike ? 'spike detected' : volRatio > 1.3 ? 'above average' : 'normal'}, score ${(volumeScore * 100).toFixed(0)}%`);
  if (patterns.length > 0) evidence.push(`Patterns: ${patterns.map((p) => p.name).join(', ')}`);
  evidence.push(`Market memory: ${marketMemory.summary}`);
  evidence.push(`Context: ${marketContext.summary}`);
  evidence.push(`Portfolio: ${portfolioIntelligence.recommendation}`);
  if (ml) evidence.push(`ML: ${ml.prediction} (${(ml.probability * 100).toFixed(0)}% prob, ${ml.confidence} confidence)`);

  return {
    multiTimeframe,
    granularRegime,
    liquidity,
    confluence,
    marketMemory,
    portfolioIntelligence,
    marketContext,
    finalConfidence,
    tradeGrade: gradeResult.grade,
    riskRating: gradeResult.riskRating,
    evidence,
  };
}
