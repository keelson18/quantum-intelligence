import type { Candle, IndicatorSet } from './types';

// ============================================================================
// Moving averages
// ============================================================================

export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < values.length; i++) {
    if (i === 0) { prev = values[i]; out[i] = prev; continue; }
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// Weighted moving average: linearly weights recent prices more heavily.
export function wma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[i - j] * (period - j);
    out[i] = sum / denom;
  }
  return out;
}

// Hull Moving Average: smooths WMA to reduce lag.
export function hma(values: number[], period: number): number[] {
  const half = Math.floor(period / 2);
  const wmaHalf = wma(values, half);
  const wmaFull = wma(values, period);
  const diff = values.map((_, i) => 2 * (wmaHalf[i] || 0) - (wmaFull[i] || 0));
  return wma(diff, Math.floor(Math.sqrt(period)));
}

// Volume-weighted moving average.
export function vwma(candles: Candle[], period: number): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let pv = 0, v = 0;
    for (let j = i - period + 1; j <= i; j++) {
      pv += candles[j].close * candles[j].volume;
      v += candles[j].volume;
    }
    out[i] = v > 0 ? pv / v : NaN;
  }
  return out;
}

// ============================================================================
// Momentum / oscillators
// ============================================================================

export function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch; else loss -= ch;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  out[period] = 100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(closes: number[]): { macd: number[]; signal: number[]; hist: number[] } {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const macdLine = closes.map((_, i) => fast[i] - slow[i]);
  const signal = ema(macdLine, 9);
  const hist = macdLine.map((m, i) => m - signal[i]);
  return { macd: macdLine, signal, hist };
}

export function stochastic(candles: Candle[], period = 14, smoothK = 3, smoothD = 3): { k: number[]; d: number[] } {
  const k: number[] = new Array(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    k[i] = hh === ll ? 50 : ((candles[i].close - ll) / (hh - ll)) * 100;
  }
  const kSmooth = sma(k.map((v) => (isNaN(v) ? 0 : v)), smoothK).map((v, i) => (isNaN(k[i]) ? NaN : v));
  const d = sma(kSmooth.map((v) => (isNaN(v) ? 0 : v)), smoothD).map((v, i) => (isNaN(kSmooth[i]) ? NaN : v));
  return { k: kSmooth, d };
}

// Stochastic RSI: stochastic applied to RSI values.
export function stochasticRsi(closes: number[], rsiPeriod = 14, stochPeriod = 14, smoothK = 3, smoothD = 3): { k: number[]; d: number[] } {
  const r = rsi(closes, rsiPeriod);
  const rClean = r.map((v) => (isNaN(v) ? 50 : v));
  const k: number[] = new Array(closes.length).fill(NaN);
  for (let i = stochPeriod - 1; i < closes.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      if (rClean[j] > hh) hh = rClean[j];
      if (rClean[j] < ll) ll = rClean[j];
    }
    k[i] = hh === ll ? 50 : ((rClean[i] - ll) / (hh - ll)) * 100;
  }
  const kSmooth = sma(k.map((v) => (isNaN(v) ? 0 : v)), smoothK).map((v, i) => (isNaN(k[i]) ? NaN : v));
  const d = sma(kSmooth.map((v) => (isNaN(v) ? 0 : v)), smoothD).map((v, i) => (isNaN(kSmooth[i]) ? NaN : v));
  return { k: kSmooth, d };
}

// Rate of Change: percentage change over `period` bars.
export function roc(closes: number[], period = 12): number[] {
  return closes.map((c, i) => (i < period ? NaN : ((c - closes[i - period]) / closes[i - period]) * 100));
}

// Momentum: raw price difference over `period` bars.
export function momentum(closes: number[], period = 10): number[] {
  return closes.map((c, i) => (i < period ? NaN : c - closes[i - period]));
}

// ============================================================================
// Volatility
// ============================================================================

export function atr(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { tr.push(candles[i].high - candles[i].low); continue; }
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function bollinger(closes: number[], period = 20, k = 2): {
  upper: number[]; middle: number[]; lower: number[]; width: number[];
} {
  const mid = sma(closes, period);
  const upper: number[] = new Array(closes.length).fill(NaN);
  const lower: number[] = new Array(closes.length).fill(NaN);
  const width: number[] = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (closes[j] - mid[i]) ** 2;
    const sd = Math.sqrt(sumSq / period);
    upper[i] = mid[i] + k * sd;
    lower[i] = mid[i] - k * sd;
    width[i] = (upper[i] - lower[i]) / mid[i];
  }
  return { upper, middle: mid, lower, width };
}

// Keltner Channels: EMA ± k*ATR.
export function keltner(candles: Candle[], period = 20, k = 2): {
  upper: number[]; middle: number[]; lower: number[];
} {
  const closes = candles.map((c) => c.close);
  const mid = ema(closes, period);
  const a = atr(candles, period);
  const upper = mid.map((m, i) => m + k * (a[i] || 0));
  const lower = mid.map((m, i) => m - k * (a[i] || 0));
  return { upper, middle: mid, lower };
}

// Donchian Channels: highest high / lowest low over period.
export function donchian(candles: Candle[], period = 20): {
  upper: number[]; middle: number[]; lower: number[];
} {
  const upper: number[] = new Array(candles.length).fill(NaN);
  const lower: number[] = new Array(candles.length).fill(NaN);
  const middle: number[] = new Array(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    upper[i] = hh; lower[i] = ll; middle[i] = (hh + ll) / 2;
  }
  return { upper, middle, lower };
}

// ============================================================================
// Volume
// ============================================================================

// On-Balance Volume: cumulative volume signed by price direction.
export function obv(candles: Candle[]): number[] {
  const out: number[] = [candles[0]?.volume ?? 0];
  for (let i = 1; i < candles.length; i++) {
    const prev = out[i - 1];
    if (candles[i].close > candles[i - 1].close) out.push(prev + candles[i].volume);
    else if (candles[i].close < candles[i - 1].close) out.push(prev - candles[i].volume);
    else out.push(prev);
  }
  return out;
}

// VWAP: cumulative (typical price × volume) / cumulative volume.
export function vwap(candles: Candle[]): number[] {
  const out: number[] = [];
  let cumPV = 0, cumV = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * c.volume;
    cumV += c.volume;
    out.push(cumV > 0 ? cumPV / cumV : c.close);
  }
  return out;
}

// Money Flow Index: volume-weighted RSI using typical price.
export function mfi(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const mf = tp.map((p, i) => p * candles[i].volume);
  for (let i = period; i < candles.length; i++) {
    let posFlow = 0, negFlow = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j] > tp[j - 1]) posFlow += mf[j];
      else if (tp[j] < tp[j - 1]) negFlow += mf[j];
    }
    out[i] = negFlow === 0 ? 100 : 100 - 100 / (1 + posFlow / negFlow);
  }
  return out;
}

// Accumulation/Distribution Line: signed volume by close location in range.
export function accumulationDist(candles: Candle[]): number[] {
  const out: number[] = [];
  let prev = 0;
  for (const c of candles) {
    const range = c.high - c.low || 1;
    const mfv = ((c.close - c.low) - (c.high - c.close)) / range * c.volume;
    prev += mfv;
    out.push(prev);
  }
  return out;
}

// ============================================================================
// Additional indicators
// ============================================================================

// ADX: trend strength (0..100). Returns the ADX line only.
export function adx(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  if (candles.length < period * 2) return out;
  const plusDM: number[] = [0], minusDM: number[] = [0], tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  // Wilder smoothing
  let trS = tr.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let plusS = plusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let minusS = minusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
  const dxArr: number[] = new Array(candles.length).fill(NaN);
  for (let i = period; i < candles.length; i++) {
    if (i > period) {
      trS = trS - trS / period + tr[i];
      plusS = plusS - plusS / period + plusDM[i];
      minusS = minusS - minusS / period + minusDM[i];
    }
    const plusDI = trS > 0 ? 100 * (plusS / trS) : 0;
    const minusDI = trS > 0 ? 100 * (minusS / trS) : 0;
    dxArr[i] = (plusDI + minusDI) > 0 ? 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI) : 0;
  }
  // ADX = Wilder smoothing of DX
  let adxVal = 0;
  for (let i = period; i < period * 2; i++) adxVal += dxArr[i] || 0;
  adxVal /= period;
  out[period * 2 - 1] = adxVal;
  for (let i = period * 2; i < candles.length; i++) {
    adxVal = (adxVal * (period - 1) + (dxArr[i] || 0)) / period;
    out[i] = adxVal;
  }
  return out;
}

// Commodity Channel Index: deviation of typical price from its SMA, normalized.
export function cci(candles: Candle[], period = 20): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const tpSma = sma(tp, period);
  for (let i = period - 1; i < candles.length; i++) {
    let meanDev = 0;
    for (let j = i - period + 1; j <= i; j++) meanDev += Math.abs(tp[j] - tpSma[i]);
    meanDev /= period;
    out[i] = meanDev !== 0 ? (tp[i] - tpSma[i]) / (0.015 * meanDev) : 0;
  }
  return out;
}

// Ichimoku Cloud: tenkan (9), kijun (26), senkouA, senkouB (52), chikou.
export function ichimoku(candles: Candle[]): {
  tenkan: number[]; kijun: number[]; senkouA: number[]; senkouB: number[]; chikou: number[];
} {
  const hl = (period: number, i: number) => {
    let hh = -Infinity, ll = Infinity;
    for (let j = Math.max(0, i - period + 1); j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    return (hh + ll) / 2;
  };
  const tenkan = candles.map((_, i) => hl(9, i));
  const kijun = candles.map((_, i) => hl(26, i));
  const senkouA = candles.map((_, i) => (tenkan[i] + kijun[i]) / 2);
  const senkouB = candles.map((_, i) => hl(52, i));
  const chikou = candles.map((_, i) => (i + 26 < candles.length ? candles[i].close : NaN));
  return { tenkan, kijun, senkouA, senkouB, chikou };
}

// Parabolic SAR: stop-and-reverse trailing dots.
export function psar(candles: Candle[], step = 0.02, max = 0.2): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  if (candles.length < 2) return out;
  let bull = true;
  let sar = candles[0].low;
  let ep = candles[0].high;
  let af = step;
  out[0] = sar;
  for (let i = 1; i < candles.length; i++) {
    sar = sar + af * (ep - sar);
    if (bull) {
      if (candles[i].low < sar) {
        bull = false; sar = ep; ep = candles[i].low; af = step;
      } else {
        if (candles[i].high > ep) { ep = candles[i].high; af = Math.min(af + step, max); }
      }
    } else {
      if (candles[i].high > sar) {
        bull = true; sar = ep; ep = candles[i].high; af = step;
      } else {
        if (candles[i].low < ep) { ep = candles[i].low; af = Math.min(af + step, max); }
      }
    }
    out[i] = sar;
  }
  return out;
}

// Pivot Points (classic) from the last completed bar's H/L/C.
export function pivotPoints(candles: Candle[]): {
  pp: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number;
} {
  const last = candles[candles.length - 1];
  if (!last) return { pp: 0, r1: 0, r2: 0, r3: 0, s1: 0, s2: 0, s3: 0 };
  const h = last.high, l = last.low, c = last.close;
  const pp = (h + l + c) / 3;
  return {
    pp,
    r1: 2 * pp - l, r2: pp + (h - l), r3: h + 2 * (pp - l),
    s1: 2 * pp - h, s2: pp - (h - l), s3: l - 2 * (h - pp),
  };
}

// ============================================================================
// Swing detection + helpers
// ============================================================================

export function findSwings(candles: Candle[], left = 3, right = 3): {
  highs: { index: number; time: number; value: number }[];
  lows: { index: number; time: number; value: number }[];
} {
  const highs: { index: number; time: number; value: number }[] = [];
  const lows: { index: number; time: number; value: number }[] = [];
  for (let i = left; i < candles.length - right; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) highs.push({ index: i, time: candles[i].time, value: candles[i].high });
    if (isLow) lows.push({ index: i, time: candles[i].time, value: candles[i].low });
  }
  return { highs, lows };
}

export function correlation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

// ============================================================================
// Compute the full indicator set in one pass
// ============================================================================

export function computeIndicators(candles: Candle[]): IndicatorSet {
  const closes = candles.map((c) => c.close);
  return {
    sma: { 20: sma(closes, 20), 50: sma(closes, 50), 200: sma(closes, 200) },
    ema: { 12: ema(closes, 12), 20: ema(closes, 20), 50: ema(closes, 50), 200: ema(closes, 200) },
    wma: { 20: wma(closes, 20), 50: wma(closes, 50) },
    hma: { 20: hma(closes, 20), 50: hma(closes, 50) },
    vwma: { 20: vwma(candles, 20) },
    rsi: rsi(closes, 14),
    macd: macd(closes),
    stochastic: stochastic(candles),
    stochasticRsi: stochasticRsi(closes),
    roc: roc(closes, 12),
    momentum: momentum(closes, 10),
    atr: atr(candles, 14),
    bollinger: bollinger(closes, 20, 2),
    keltner: keltner(candles, 20, 2),
    donchian: donchian(candles, 20),
    obv: obv(candles),
    vwap: vwap(candles),
    mfi: mfi(candles, 14),
    ad: accumulationDist(candles),
    adx: adx(candles, 14),
    cci: cci(candles, 20),
    ichimoku: ichimoku(candles),
    psar: psar(candles),
    pivots: pivotPoints(candles),
  };
}
