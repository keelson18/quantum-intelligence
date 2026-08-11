import type { Candle, MarketStructure, StructurePoint, StructureEvent, Regime, SmartMoney, OrderBlock, FairValueGap, LiquidityPool, FibLevels } from './types';
import { findSwings, adx } from './indicators';

// ============================================================================
// Market Structure Engine
// Identifies swing sequences (HH/HL/LH/LL), breaks of structure (BOS),
// changes of character (CHoCH), and classifies the current regime.
// ============================================================================

export function analyzeMarketStructure(candles: Candle[]): MarketStructure {
  if (candles.length < 30) {
    return { swings: [], labels: [], events: [], regime: 'range', trendStrength: 0 };
  }
  const { highs, lows } = findSwings(candles, 3, 3);
  // Merge and sort all swings chronologically with type tags.
  const swings = [
    ...highs.map((h) => ({ ...h, type: 'high' as const })),
    ...lows.map((l) => ({ ...l, type: 'low' as const })),
  ].sort((a, b) => a.index - b.index);

  // Label each swing relative to its predecessor of the same type.
  const labels: { index: number; label: StructurePoint }[] = [];
  let prevHigh = highs[0], prevLow = lows[0];
  for (const h of highs) {
    if (h === prevHigh) { labels.push({ index: h.index, label: 'HH' }); continue; }
    labels.push({ index: h.index, label: h.value > prevHigh.value ? 'HH' : 'LH' });
    prevHigh = h;
  }
  for (const l of lows) {
    if (l === prevLow) { labels.push({ index: l.index, label: 'HL' }); continue; }
    labels.push({ index: l.index, label: l.value > prevLow.value ? 'HL' : 'LL' });
    prevLow = l;
  }

  // Detect BOS / CHoCH from the most recent breaks.
  const events: StructureEvent[] = [];
  const lastPrice = candles[candles.length - 1].close;
  if (highs.length >= 2) {
    const lastHigh = highs[highs.length - 1];
    if (lastPrice > lastHigh.value) {
      // Did we break a swing high after making lower highs? → CHoCH (bearish→bullish).
      const priorHighs = highs.slice(-3, -1);
      const wasBearish = priorHighs.length >= 2 && priorHighs[1].value < priorHighs[0].value;
      events.push({
        type: wasBearish ? 'CHoCH' : 'BOS',
        direction: 'bullish',
        index: candles.length - 1,
        time: candles[candles.length - 1].time,
        level: lastHigh.value,
        reason: wasBearish ? 'Bearish structure broken — character change to bullish' : 'Bullish break of structure — continuation higher',
      });
    }
  }
  if (lows.length >= 2) {
    const lastLow = lows[lows.length - 1];
    if (lastPrice < lastLow.value) {
      const priorLows = lows.slice(-3, -1);
      const wasBullish = priorLows.length >= 2 && priorLows[1].value > priorLows[0].value;
      events.push({
        type: wasBullish ? 'CHoCH' : 'BOS',
        direction: 'bearish',
        index: candles.length - 1,
        time: candles[candles.length - 1].time,
        level: lastLow.value,
        reason: wasBullish ? 'Bullish structure broken — character change to bearish' : 'Bearish break of structure — continuation lower',
      });
    }
  }

  // Classify regime from the recent swing sequence + ADX trend strength.
  const recentHighs = highs.slice(-3);
  const recentLows = lows.slice(-3);
  let regime: Regime = 'range';
  if (recentHighs.length >= 2 && recentLows.length >= 2) {
    const higherHighs = recentHighs.length >= 2 && recentHighs[recentHighs.length - 1].value > recentHighs[0].value;
    const higherLows = recentLows.length >= 2 && recentLows[recentLows.length - 1].value > recentLows[0].value;
    const lowerHighs = recentHighs.length >= 2 && recentHighs[recentHighs.length - 1].value < recentHighs[0].value;
    const lowerLows = recentLows.length >= 2 && recentLows[recentLows.length - 1].value < recentLows[0].value;
    if (higherHighs && higherLows) regime = 'trend_up';
    else if (lowerHighs && lowerLows) regime = 'trend_down';
    else if (Math.abs(recentHighs[recentHighs.length - 1].value - recentHighs[0].value) / recentHighs[0].value < 0.03 &&
             Math.abs(recentLows[recentLows.length - 1].value - recentLows[0].value) / recentLows[0].value < 0.03) {
      regime = 'consolidation';
    } else if (Math.abs(recentHighs[recentHighs.length - 1].value - recentLows[recentLows.length - 1].value) / recentHighs[recentHighs.length - 1].value > 0.08) {
      regime = 'expansion';
    }
  }

  // ADX quantifies trend strength; >25 → trending.
  const adxArr = adx(candles, 14);
  const lastAdx = adxArr[adxArr.length - 1] || 0;
  const trendStrength = Math.min(1, lastAdx / 50);

  return { swings, labels, events, regime, trendStrength };
}

// ============================================================================
// Smart Money Concepts
// Order blocks, fair value gaps, liquidity pools, equal highs/lows,
// premium/discount zones, breaker blocks.
// ============================================================================

export function analyzeSmartMoney(candles: Candle[]): SmartMoney {
  if (candles.length < 20) {
    return { orderBlocks: [], fairValueGaps: [], liquidityPools: [], equalHighs: [], equalLows: [], premiumDiscount: { premium: 0, discount: 0, midpoint: 0 }, breakerBlocks: [] };
  }
  const { highs, lows } = findSwings(candles, 3, 3);

  // Order blocks: last opposite-color candle before a strong move.
  const orderBlocks: OrderBlock[] = [];
  for (let i = 5; i < candles.length - 1; i++) {
    const move = Math.abs(candles[i + 1].close - candles[i].close) / candles[i].close;
    if (move > 0.015) {
      const ob = candles[i];
      const side = candles[i + 1].close > candles[i].close ? 'bullish' : 'bearish';
      orderBlocks.push({ index: i, time: ob.time, high: ob.high, low: ob.low, side });
    }
  }
  const recentOBs = orderBlocks.slice(-6);

  // Fair value gaps: three-candle imbalance where candle[1]'s range doesn't
  // overlap with candle[0] or candle[2].
  const fairValueGaps: FairValueGap[] = [];
  for (let i = 2; i < candles.length; i++) {
    const [a, b, c] = candles.slice(i - 2, i + 1);
    // Bullish FVG: b.low > a.high (gap up)
    if (b.low > a.high) {
      fairValueGaps.push({ index: i - 1, time: b.time, top: b.low, bottom: a.high, side: 'bullish' });
    }
    // Bearish FVG: b.high < a.low (gap down)
    if (b.high < a.low) {
      fairValueGaps.push({ index: i - 1, time: b.time, top: a.low, bottom: b.high, side: 'bearish' });
    }
    void c;
  }
  const recentFVGs = fairValueGaps.slice(-5);

  // Liquidity pools: swing highs/lows where price reversed — resting stops cluster there.
  const liquidityPools: LiquidityPool[] = [
    ...highs.slice(-4).map((h) => ({ time: h.time, level: h.value, type: 'high' as const })),
    ...lows.slice(-4).map((l) => ({ time: l.time, level: l.value, type: 'low' as const })),
  ];

  // Equal highs/lows: swing points within 0.2% of each other (liquidity magnets).
  const equalHighs: { time: number; level: number }[] = [];
  for (let i = 1; i < highs.length; i++) {
    if (Math.abs(highs[i].value - highs[i - 1].value) / highs[i].value < 0.002) {
      equalHighs.push({ time: highs[i].time, level: highs[i].value });
    }
  }
  const equalLows: { time: number; level: number }[] = [];
  for (let i = 1; i < lows.length; i++) {
    if (Math.abs(lows[i].value - lows[i - 1].value) / lows[i].value < 0.002) {
      equalLows.push({ time: lows[i].time, level: lows[i].value });
    }
  }

  // Premium/discount: split the recent range at the 50% equilibrium.
  const rangeHigh = highs.length ? Math.max(...highs.slice(-3).map((h) => h.value)) : candles[candles.length - 1].high;
  const rangeLow = lows.length ? Math.min(...lows.slice(-3).map((l) => l.value)) : candles[candles.length - 1].low;
  const midpoint = (rangeHigh + rangeLow) / 2;
  const last = candles[candles.length - 1].close;
  const premiumDiscount = {
    premium: rangeHigh,
    discount: rangeLow,
    midpoint,
  };
  void last;

  // Breaker blocks: failed order blocks that flip role (support↔resistance).
  const breakerBlocks: OrderBlock[] = recentOBs
    .filter((ob) => {
      const after = candles.slice(ob.index + 1);
      const breached = after.some((c) => ob.side === 'bullish' ? c.close < ob.low : c.close > ob.high);
      return breached;
    })
    .slice(-3);

  return {
    orderBlocks: recentOBs,
    fairValueGaps: recentFVGs,
    liquidityPools,
    equalHighs: equalHighs.slice(-3),
    equalLows: equalLows.slice(-3),
    premiumDiscount,
    breakerBlocks,
  };
}

// ============================================================================
// Fibonacci engine — retracements + extensions from most recent significant swing
// ============================================================================

export function computeFibonacci(candles: Candle[]): FibLevels | null {
  if (candles.length < 40) return null;
  const { highs, lows } = findSwings(candles, 3, 3);
  if (!highs.length || !lows.length) return null;
  const lastHigh = highs[highs.length - 1];
  const lastLow = lows[lows.length - 1];
  const direction = lastHigh.index > lastLow.index ? 'up' : 'down';
  const high = lastHigh.value, low = lastLow.value, diff = high - low;
  if (diff <= 0) return null;

  const retrLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786];
  const extLevels = [1.272, 1.618, 2.618];
  const retracements = retrLevels.map((l) => ({
    level: l,
    price: direction === 'up' ? high - diff * l : low + diff * l,
  }));
  const extensions = extLevels.map((l) => ({
    level: l,
    price: direction === 'up' ? high + diff * (l - 1) : low - diff * (l - 1),
  }));

  return { swingHigh: lastHigh, swingLow: lastLow, direction, retracements, extensions };
}
