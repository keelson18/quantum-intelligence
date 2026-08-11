import type { Candle, PatternHit, Overlay, Side } from './types';

// ============================================================================
// Candlestick pattern detection
// Each detector examines the last N bars and returns a PatternHit if found.
// Body/range ratios classify candle shapes; confidence is heuristic-based on
// how strongly the pattern's ideal conditions are met.
// ============================================================================

function body(c: Candle) { return Math.abs(c.close - c.open); }
function range(c: Candle) { return c.high - c.low || 1; }
function upperWick(c: Candle) { return c.high - Math.max(c.open, c.close); }
function lowerWick(c: Candle) { return Math.min(c.open, c.close) - c.low; }
function isBull(c: Candle) { return c.close > c.open; }
function isBear(c: Candle) { return c.close < c.open; }

function marker(time: number, pos: 'aboveBar' | 'belowBar', color: string, shape: 'arrowUp' | 'arrowDown', text: string): Overlay {
  return { type: 'markers', id: text, markers: [{ time, position: pos, color, shape, text }] };
}

// Hammer: small body at top, long lower wick (>= 2× body), in a downtrend.
function hammer(candles: Candle[]): PatternHit | null {
  const c = candles[candles.length - 1];
  if (!c) return null;
  const b = body(c), r = range(c), lw = lowerWick(c), uw = upperWick(c);
  if (lw >= 2 * b && uw <= b * 0.3 && b / r < 0.35) {
    return { kind: 'candlestick', name: 'Hammer', side: 'buy', confidence: 0.55, index: candles.length - 1, time: c.time, reason: 'Hammer: long lower wick signals rejection of lower prices', overlays: [marker(c.time, 'belowBar', '#22c55e', 'arrowUp', 'Hammer')] };
  }
  return null;
}

function invertedHammer(candles: Candle[]): PatternHit | null {
  const c = candles[candles.length - 1];
  if (!c) return null;
  const b = body(c), r = range(c), uw = upperWick(c), lw = lowerWick(c);
  if (uw >= 2 * b && lw <= b * 0.3 && b / r < 0.35) {
    return { kind: 'candlestick', name: 'Inverted Hammer', side: 'buy', confidence: 0.45, index: candles.length - 1, time: c.time, reason: 'Inverted hammer: potential bottom reversal', overlays: [marker(c.time, 'belowBar', '#22c55e', 'arrowUp', 'Inv Hammer')] };
  }
  return null;
}

function shootingStar(candles: Candle[]): PatternHit | null {
  const c = candles[candles.length - 1];
  if (!c) return null;
  const b = body(c), r = range(c), uw = upperWick(c), lw = lowerWick(c);
  if (uw >= 2 * b && lw <= b * 0.3 && b / r < 0.35 && isBear(c)) {
    return { kind: 'candlestick', name: 'Shooting Star', side: 'sell', confidence: 0.55, index: candles.length - 1, time: c.time, reason: 'Shooting star: long upper wick signals rejection of highs', overlays: [marker(c.time, 'aboveBar', '#ef4444', 'arrowDown', 'Star')] };
  }
  return null;
}

function hangingMan(candles: Candle[]): PatternHit | null {
  const c = candles[candles.length - 1];
  if (!c) return null;
  const b = body(c), r = range(c), lw = lowerWick(c), uw = upperWick(c);
  if (lw >= 2 * b && uw <= b * 0.3 && b / r < 0.35 && isBear(c)) {
    return { kind: 'candlestick', name: 'Hanging Man', side: 'sell', confidence: 0.5, index: candles.length - 1, time: c.time, reason: 'Hanging man: bearish reversal after uptrend', overlays: [marker(c.time, 'aboveBar', '#ef4444', 'arrowDown', 'Hang Man')] };
  }
  return null;
}

function bullishEngulfing(candles: Candle[]): PatternHit | null {
  if (candles.length < 2) return null;
  const prev = candles[candles.length - 2], cur = candles[candles.length - 1];
  if (isBear(prev) && isBull(cur) && cur.close >= prev.open && cur.open <= prev.close && body(cur) > body(prev)) {
    return { kind: 'candlestick', name: 'Bullish Engulfing', side: 'buy', confidence: 0.6, index: candles.length - 1, time: cur.time, reason: 'Bullish engulfing: buyer overwhelms prior bearish candle', overlays: [marker(cur.time, 'belowBar', '#22c55e', 'arrowUp', 'Bull Eng')] };
  }
  return null;
}

function bearishEngulfing(candles: Candle[]): PatternHit | null {
  if (candles.length < 2) return null;
  const prev = candles[candles.length - 2], cur = candles[candles.length - 1];
  if (isBull(prev) && isBear(cur) && cur.close <= prev.open && cur.open >= prev.close && body(cur) > body(prev)) {
    return { kind: 'candlestick', name: 'Bearish Engulfing', side: 'sell', confidence: 0.6, index: candles.length - 1, time: cur.time, reason: 'Bearish engulfing: seller overwhelms prior bullish candle', overlays: [marker(cur.time, 'aboveBar', '#ef4444', 'arrowDown', 'Bear Eng')] };
  }
  return null;
}

function morningStar(candles: Candle[]): PatternHit | null {
  if (candles.length < 3) return null;
  const [a, b, c] = candles.slice(-3);
  if (isBear(a) && body(b) < body(a) * 0.5 && isBull(c) && c.close > (a.open + a.close) / 2) {
    return { kind: 'candlestick', name: 'Morning Star', side: 'buy', confidence: 0.62, index: candles.length - 1, time: c.time, reason: 'Morning star: three-candle bullish reversal', overlays: [marker(c.time, 'belowBar', '#22c55e', 'arrowUp', 'Morning')] };
  }
  return null;
}

function eveningStar(candles: Candle[]): PatternHit | null {
  if (candles.length < 3) return null;
  const [a, b, c] = candles.slice(-3);
  if (isBull(a) && body(b) < body(a) * 0.5 && isBear(c) && c.close < (a.open + a.close) / 2) {
    return { kind: 'candlestick', name: 'Evening Star', side: 'sell', confidence: 0.62, index: candles.length - 1, time: c.time, reason: 'Evening star: three-candle bearish reversal', overlays: [marker(c.time, 'aboveBar', '#ef4444', 'arrowDown', 'Evening')] };
  }
  return null;
}

function doji(candles: Candle[]): PatternHit | null {
  const c = candles[candles.length - 1];
  if (!c) return null;
  const b = body(c), r = range(c);
  if (b / r < 0.1 && r > 0) {
    const side: Side = 'neutral';
    return { kind: 'candlestick', name: 'Doji', side, confidence: 0.35, index: candles.length - 1, time: c.time, reason: 'Doji: indecision — open and close nearly equal', overlays: [marker(c.time, 'aboveBar', '#9ca3af', 'arrowDown', 'Doji')] };
  }
  return null;
}

function dragonflyDoji(candles: Candle[]): PatternHit | null {
  const c = candles[candles.length - 1];
  if (!c) return null;
  const b = body(c), r = range(c), lw = lowerWick(c), uw = upperWick(c);
  if (b / r < 0.1 && lw > r * 0.6 && uw < r * 0.1) {
    return { kind: 'candlestick', name: 'Dragonfly Doji', side: 'buy', confidence: 0.5, index: candles.length - 1, time: c.time, reason: 'Dragonfly doji: buyers rejected lows', overlays: [marker(c.time, 'belowBar', '#22c55e', 'arrowUp', 'Dragon')] };
  }
  return null;
}

function gravestoneDoji(candles: Candle[]): PatternHit | null {
  const c = candles[candles.length - 1];
  if (!c) return null;
  const b = body(c), r = range(c), uw = upperWick(c), lw = lowerWick(c);
  if (b / r < 0.1 && uw > r * 0.6 && lw < r * 0.1) {
    return { kind: 'candlestick', name: 'Gravestone Doji', side: 'sell', confidence: 0.5, index: candles.length - 1, time: c.time, reason: 'Gravestone doji: sellers rejected highs', overlays: [marker(c.time, 'aboveBar', '#ef4444', 'arrowDown', 'Grave')] };
  }
  return null;
}

function threeWhiteSoldiers(candles: Candle[]): PatternHit | null {
  if (candles.length < 3) return null;
  const three = candles.slice(-3);
  if (three.every(isBull) && three[2].close > three[1].close && three[1].close > three[0].close) {
    return { kind: 'candlestick', name: 'Three White Soldiers', side: 'buy', confidence: 0.6, index: candles.length - 1, time: three[2].time, reason: 'Three white soldiers: strong bullish momentum', overlays: [marker(three[2].time, 'belowBar', '#22c55e', 'arrowUp', '3 White')] };
  }
  return null;
}

function threeBlackCrows(candles: Candle[]): PatternHit | null {
  if (candles.length < 3) return null;
  const three = candles.slice(-3);
  if (three.every(isBear) && three[2].close < three[1].close && three[1].close < three[0].close) {
    return { kind: 'candlestick', name: 'Three Black Crows', side: 'sell', confidence: 0.6, index: candles.length - 1, time: three[2].time, reason: 'Three black crows: strong bearish momentum', overlays: [marker(three[2].time, 'aboveBar', '#ef4444', 'arrowDown', '3 Black')] };
  }
  return null;
}

function tweezerTop(candles: Candle[]): PatternHit | null {
  if (candles.length < 2) return null;
  const [a, b] = candles.slice(-2);
  if (isBull(a) && isBear(b) && Math.abs(a.high - b.high) / a.high < 0.003) {
    return { kind: 'candlestick', name: 'Tweezer Top', side: 'sell', confidence: 0.5, index: candles.length - 1, time: b.time, reason: 'Tweezer top: matching highs signal rejection', overlays: [marker(b.time, 'aboveBar', '#ef4444', 'arrowDown', 'TweezT')] };
  }
  return null;
}

function tweezerBottom(candles: Candle[]): PatternHit | null {
  if (candles.length < 2) return null;
  const [a, b] = candles.slice(-2);
  if (isBear(a) && isBull(b) && Math.abs(a.low - b.low) / a.low < 0.003) {
    return { kind: 'candlestick', name: 'Tweezer Bottom', side: 'buy', confidence: 0.5, index: candles.length - 1, time: b.time, reason: 'Tweezer bottom: matching lows signal rejection', overlays: [marker(b.time, 'belowBar', '#22c55e', 'arrowUp', 'TweezB')] };
  }
  return null;
}

function insideBar(candles: Candle[]): PatternHit | null {
  if (candles.length < 2) return null;
  const [a, b] = candles.slice(-2);
  if (b.high <= a.high && b.low >= a.low) {
    return { kind: 'candlestick', name: 'Inside Bar', side: 'neutral', confidence: 0.3, index: candles.length - 1, time: b.time, reason: 'Inside bar: consolidation, breakout pending', overlays: [marker(b.time, 'aboveBar', '#9ca3af', 'arrowDown', 'Inside')] };
  }
  return null;
}

function outsideBar(candles: Candle[]): PatternHit | null {
  if (candles.length < 2) return null;
  const [a, b] = candles.slice(-2);
  if (b.high > a.high && b.low < a.low) {
    const side: Side = isBull(b) ? 'buy' : 'sell';
    return { kind: 'candlestick', name: 'Outside Bar', side, confidence: 0.4, index: candles.length - 1, time: b.time, reason: 'Outside bar: volatility expansion', overlays: [marker(b.time, isBull(b) ? 'belowBar' : 'aboveBar', isBull(b) ? '#22c55e' : '#ef4444', isBull(b) ? 'arrowUp' : 'arrowDown', 'Outside')] };
  }
  return null;
}

const CANDLESTICK_DETECTORS = [
  hammer, invertedHammer, shootingStar, hangingMan,
  bullishEngulfing, bearishEngulfing, morningStar, eveningStar,
  doji, dragonflyDoji, gravestoneDoji,
  threeWhiteSoldiers, threeBlackCrows,
  tweezerTop, tweezerBottom, insideBar, outsideBar,
];

export function detectCandlesticks(candles: Candle[]): PatternHit[] {
  if (candles.length < 3) return [];
  return CANDLESTICK_DETECTORS.map((d) => d(candles)).filter((p): p is PatternHit => p !== null);
}

// ============================================================================
// Chart pattern detection
// Uses swing-point geometry to identify larger multi-bar formations.
// ============================================================================

import { findSwings } from './indicators';

function lineOverlay(points: { time: number; value: number }[], color: string, label: string): Overlay {
  return { type: 'line', id: label, points, color, label };
}

function detectHeadShoulders(candles: Candle[]): PatternHit | null {
  if (candles.length < 40) return null;
  const { highs } = findSwings(candles, 3, 3);
  if (highs.length < 3) return null;
  const [a, b, c] = highs.slice(-3);
  const isRegular = b.value > a.value && b.value > c.value && Math.abs(a.value - c.value) / b.value < 0.08;
  const isInverse = b.value < a.value && b.value < c.value && Math.abs(a.value - c.value) / b.value < 0.08;
  if (!isRegular && !isInverse) return null;
  const last = candles[candles.length - 1].close;
  const neckline = isRegular ? Math.min(a.value, c.value) : Math.max(a.value, c.value);
  if (isRegular && last < neckline) {
    return { kind: 'chart', name: 'Head & Shoulders', side: 'sell', confidence: 0.62, index: b.index, time: b.time, reason: 'Bearish H&S confirmed, neckline broken', overlays: [lineOverlay([a, b, c], '#ef4444', 'H&S')] };
  }
  if (isInverse && last > neckline) {
    return { kind: 'chart', name: 'Inverse H&S', side: 'buy', confidence: 0.62, index: b.index, time: b.time, reason: 'Bullish inverse H&S confirmed', overlays: [lineOverlay([a, b, c], '#22c55e', 'iH&S')] };
  }
  return null;
}

function detectDoubleTopBottom(candles: Candle[]): PatternHit | null {
  if (candles.length < 30) return null;
  const { highs, lows } = findSwings(candles, 3, 3);
  if (highs.length >= 2) {
    const [a, b] = highs.slice(-2);
    if (Math.abs(a.value - b.value) / a.value < 0.03) {
      const last = candles[candles.length - 1].close;
      const trough = Math.min(...candles.slice(a.index, b.index + 1).map((c) => c.low));
      if (last < trough) return { kind: 'chart', name: 'Double Top', side: 'sell', confidence: 0.58, index: b.index, time: b.time, reason: 'Double top confirmed by breakdown', overlays: [lineOverlay([a, b], '#ef4444', 'DT')] };
    }
  }
  if (lows.length >= 2) {
    const [a, b] = lows.slice(-2);
    if (Math.abs(a.value - b.value) / a.value < 0.03) {
      const last = candles[candles.length - 1].close;
      const peak = Math.max(...candles.slice(a.index, b.index + 1).map((c) => c.high));
      if (last > peak) return { kind: 'chart', name: 'Double Bottom', side: 'buy', confidence: 0.58, index: b.index, time: b.time, reason: 'Double bottom confirmed by breakout', overlays: [lineOverlay([a, b], '#22c55e', 'DB')] };
    }
  }
  return null;
}

function detectTripleTopBottom(candles: Candle[]): PatternHit | null {
  if (candles.length < 50) return null;
  const { highs, lows } = findSwings(candles, 3, 3);
  if (highs.length >= 3) {
    const [a, b, c] = highs.slice(-3);
    const spread = (Math.max(a.value, b.value, c.value) - Math.min(a.value, b.value, c.value)) / a.value;
    if (spread < 0.04) {
      const last = candles[candles.length - 1].close;
      const floor = Math.min(...candles.slice(a.index, c.index + 1).map((x) => x.low));
      if (last < floor) return { kind: 'chart', name: 'Triple Top', side: 'sell', confidence: 0.6, index: c.index, time: c.time, reason: 'Triple top breakdown', overlays: [lineOverlay([a, b, c], '#ef4444', 'TT')] };
    }
  }
  if (lows.length >= 3) {
    const [a, b, c] = lows.slice(-3);
    const spread = (Math.max(a.value, b.value, c.value) - Math.min(a.value, b.value, c.value)) / a.value;
    if (spread < 0.04) {
      const last = candles[candles.length - 1].close;
      const ceil = Math.max(...candles.slice(a.index, c.index + 1).map((x) => x.high));
      if (last > ceil) return { kind: 'chart', name: 'Triple Bottom', side: 'buy', confidence: 0.6, index: c.index, time: c.time, reason: 'Triple bottom breakout', overlays: [lineOverlay([a, b, c], '#22c55e', 'TB')] };
    }
  }
  return null;
}

// Triangles, flags, pennants, wedges, rectangles, channels — all via trendline slope analysis.
function detectContinuation(candles: Candle[]): PatternHit | null {
  if (candles.length < 40) return null;
  const { highs, lows } = findSwings(candles, 2, 2);
  if (highs.length < 2 || lows.length < 2) return null;
  const hh = highs.slice(-2), ll = lows.slice(-2);
  const slopeHigh = (hh[1].value - hh[0].value) / (hh[1].index - hh[0].index || 1);
  const slopeLow = (ll[1].value - ll[0].value) / (ll[1].index - ll[0].index || 1);

  // Ascending triangle: flat highs, rising lows → bullish.
  if (Math.abs(slopeHigh) < slopeLow * 0.2 && slopeLow > 0) {
    return { kind: 'chart', name: 'Ascending Triangle', side: 'buy', confidence: 0.55, index: candles.length - 1, time: candles[candles.length - 1].time, reason: 'Ascending triangle: flat resistance + rising support', overlays: [lineOverlay([hh[0], hh[1]], '#f59e0b', 'resist'), lineOverlay([ll[0], ll[1]], '#22c55e', 'support')] };
  }
  // Descending triangle: flat lows, falling highs → bearish.
  if (Math.abs(slopeLow) < Math.abs(slopeHigh) * 0.2 && slopeHigh < 0) {
    return { kind: 'chart', name: 'Descending Triangle', side: 'sell', confidence: 0.55, index: candles.length - 1, time: candles[candles.length - 1].time, reason: 'Descending triangle: flat support + falling resistance', overlays: [lineOverlay([hh[0], hh[1]], '#ef4444', 'resist'), lineOverlay([ll[0], ll[1]], '#f59e0b', 'support')] };
  }
  // Symmetrical triangle: converging trendlines.
  if (Math.sign(slopeHigh) !== Math.sign(slopeLow) && Math.abs(slopeHigh - slopeLow) > 0) {
    const last = candles[candles.length - 1].close;
    const side: Side = last > (hh[0].value + ll[0].value) / 2 ? 'buy' : 'sell';
    return { kind: 'chart', name: 'Symmetrical Triangle', side, confidence: 0.48, index: candles.length - 1, time: candles[candles.length - 1].time, reason: 'Symmetrical triangle — breakout direction pending', overlays: [lineOverlay([hh[0], hh[1]], '#f59e0b', 'resist'), lineOverlay([ll[0], ll[1]], '#f59e0b', 'support')] };
  }
  // Flag: parallel channel in opposite direction to prior trend.
  if (Math.sign(slopeHigh) === Math.sign(slopeLow) && Math.abs(slopeHigh - slopeLow) / (Math.abs(slopeHigh) + 1e-9) < 0.3) {
    const dir = slopeHigh > 0 ? 'sell' : 'buy'; // counter-trend flag
    return { kind: 'chart', name: slopeHigh > 0 ? 'Bear Flag' : 'Bull Flag', side: dir as Side, confidence: 0.5, index: candles.length - 1, time: candles[candles.length - 1].time, reason: 'Flag pattern — continuation likely after consolidation', overlays: [lineOverlay([hh[0], hh[1]], '#06b6d4', 'upper'), lineOverlay([ll[0], ll[1]], '#06b6d4', 'lower')] };
  }
  // Pennant: converging but shorter than triangle.
  if (Math.abs(slopeHigh) < Math.abs(slopeLow) * 0.5 || Math.abs(slopeLow) < Math.abs(slopeHigh) * 0.5) {
    const last = candles[candles.length - 1].close;
    const side: Side = last > (hh[0].value + ll[0].value) / 2 ? 'buy' : 'sell';
    return { kind: 'chart', name: 'Pennant', side, confidence: 0.45, index: candles.length - 1, time: candles[candles.length - 1].time, reason: 'Pennant: converging consolidation', overlays: [lineOverlay([hh[0], hh[1]], '#a855f7', 'resist'), lineOverlay([ll[0], ll[1]], '#a855f7', 'support')] };
  }
  return null;
}

// Wedge: both trendlines slope same direction but converge.
function detectWedge(candles: Candle[]): PatternHit | null {
  if (candles.length < 40) return null;
  const { highs, lows } = findSwings(candles, 2, 2);
  if (highs.length < 2 || lows.length < 2) return null;
  const hh = highs.slice(-2), ll = lows.slice(-2);
  const slopeHigh = (hh[1].value - hh[0].value) / (hh[1].index - hh[0].index || 1);
  const slopeLow = (ll[1].value - ll[0].value) / (ll[1].index - ll[0].index || 1);
  if (Math.sign(slopeHigh) === Math.sign(slopeLow) && Math.abs(slopeHigh) > Math.abs(slopeLow)) {
    return { kind: 'chart', name: 'Rising Wedge', side: 'sell', confidence: 0.5, index: candles.length - 1, time: candles[candles.length - 1].time, reason: 'Rising wedge: bearish reversal pattern', overlays: [lineOverlay([hh[0], hh[1]], '#ef4444', 'wedgeH'), lineOverlay([ll[0], ll[1]], '#ef4444', 'wedgeL')] };
  }
  if (Math.sign(slopeHigh) === Math.sign(slopeLow) && Math.abs(slopeLow) > Math.abs(slopeHigh)) {
    return { kind: 'chart', name: 'Falling Wedge', side: 'buy', confidence: 0.5, index: candles.length - 1, time: candles[candles.length - 1].time, reason: 'Falling wedge: bullish reversal pattern', overlays: [lineOverlay([hh[0], hh[1]], '#22c55e', 'wedgeH'), lineOverlay([ll[0], ll[1]], '#22c55e', 'wedgeL')] };
  }
  return null;
}

// Rectangle: horizontal parallel channel (range).
function detectRectangle(candles: Candle[]): PatternHit | null {
  if (candles.length < 40) return null;
  const { highs, lows } = findSwings(candles, 2, 2);
  if (highs.length < 2 || lows.length < 2) return null;
  const hh = highs.slice(-2), ll = lows.slice(-2);
  const flatHigh = Math.abs(hh[1].value - hh[0].value) / hh[0].value < 0.02;
  const flatLow = Math.abs(ll[1].value - ll[0].value) / ll[0].value < 0.02;
  if (flatHigh && flatLow) {
    const last = candles[candles.length - 1].close;
    const side: Side = last > hh[1].value ? 'buy' : last < ll[1].value ? 'sell' : 'neutral';
    return { kind: 'chart', name: 'Rectangle', side, confidence: 0.45, index: candles.length - 1, time: candles[candles.length - 1].time, reason: 'Rectangle range — breakout direction sets trend', overlays: [lineOverlay([hh[0], hh[1]], '#6b7280', 'top'), lineOverlay([ll[0], ll[1]], '#6b7280', 'bottom')] };
  }
  return null;
}

// Cup & Handle: rounded bottom + small pullback. Approximated via swing curvature.
function detectCupHandle(candles: Candle[]): PatternHit | null {
  if (candles.length < 60) return null;
  const { highs, lows } = findSwings(candles, 4, 4);
  if (highs.length < 1 || lows.length < 2) return null;
  const recent = candles.slice(-60);
  const peak = Math.max(...recent.map((c) => c.high));
  const trough = Math.min(...recent.slice(10, 40).map((c) => c.low));
  const last = recent[recent.length - 1].close;
  // Cup: price recovered near prior peak; handle: small recent pullback.
  if (last > peak * 0.95 && last < peak * 1.02 && trough < peak * 0.85) {
    const pullback = recent.slice(-5);
    const pullbackLow = Math.min(...pullback.map((c) => c.low));
    if (pullbackLow > trough && pullbackLow < last) {
      return { kind: 'chart', name: 'Cup & Handle', side: 'buy', confidence: 0.52, index: candles.length - 1, time: candles[candles.length - 1].time, reason: 'Cup & handle: bullish continuation after rounded base', overlays: [lineOverlay([{ time: recent[0].time, value: peak }, { time: recent[30].time, value: trough }, { time: recent[recent.length - 1].time, value: last }], '#22c55e', 'C&H')] };
    }
  }
  return null;
}

const CHART_DETECTORS = [
  detectHeadShoulders, detectDoubleTopBottom, detectTripleTopBottom,
  detectContinuation, detectWedge, detectRectangle, detectCupHandle,
];

export function detectChartPatterns(candles: Candle[]): PatternHit[] {
  if (candles.length < 40) return [];
  return CHART_DETECTORS.map((d) => d(candles)).filter((p): p is PatternHit => p !== null);
}

export function detectAllPatterns(candles: Candle[]): PatternHit[] {
  return [...detectCandlesticks(candles), ...detectChartPatterns(candles)];
}
