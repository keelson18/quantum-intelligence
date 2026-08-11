import type { Candle, IndicatorSet, MarketStructure, SmartMoney, FibLevels, Signal, Side, StrategyName, StrategyEvaluation, MLPrediction } from './types';
import { computeIndicators } from './indicators';
import { detectAllPatterns } from './patterns';
import { analyzeMarketStructure, analyzeSmartMoney, computeFibonacci } from './structure';

// ============================================================================
// Strategy Library
// Each strategy evaluates the current market state and returns a Signal with
// a category, confidence, and chart overlays. The AI selector then chooses the
// most appropriate strategy based on the detected market regime.
// ============================================================================

interface AnalysisContext {
  candles: Candle[];
  ind: IndicatorSet;
  structure: MarketStructure;
  smc: SmartMoney;
  fib: FibLevels | null;
}

function last(arr: number[]): number { return arr[arr.length - 1] ?? 0; }

// ---- Trend Following: MA alignment + ADX confirmation ----
function trendFollowing(ctx: AnalysisContext): Signal {
  const { candles, ind } = ctx;
  const i = candles.length - 1;
  const ema20 = ind.ema[20][i], ema50 = ind.ema[50][i], ema200 = ind.ema[200][i];
  const adx = last(ind.adx);
  const closes = candles.map((c) => c.close);
  const lastClose = closes[i];
  let side: Side = 'neutral';
  let reason = 'MAs not aligned';
  let confidence = 0.4;
  if (ema20 > ema50 && ema50 > ema200 && lastClose > ema20) {
    side = 'buy'; confidence = 0.6 + (adx > 25 ? 0.15 : 0);
    reason = `Bullish MA stack (20>50>200), ADX ${adx.toFixed(0)}`;
  } else if (ema20 < ema50 && ema50 < ema200 && lastClose < ema20) {
    side = 'sell'; confidence = 0.6 + (adx > 25 ? 0.15 : 0);
    reason = `Bearish MA stack (20<50<200), ADX ${adx.toFixed(0)}`;
  }
  return {
    strategy: 'Trend Following',
    category: 'trend',
    side, confidence, reason,
    overlays: [
      { type: 'line', id: 'ema20', points: closes.map((_, j) => ({ time: candles[j].time, value: ind.ema[20][j] })).filter((p) => !isNaN(p.value)), color: '#10a37f', label: 'EMA20' },
      { type: 'line', id: 'ema50', points: closes.map((_, j) => ({ time: candles[j].time, value: ind.ema[50][j] })).filter((p) => !isNaN(p.value)), color: '#f59e0b', label: 'EMA50' },
      { type: 'line', id: 'ema200', points: closes.map((_, j) => ({ time: candles[j].time, value: ind.ema[200][j] })).filter((p) => !isNaN(p.value)), color: '#6b7280', label: 'EMA200' },
    ],
  };
}

// ---- Breakout: Donchian channel breakout + volume surge ----
function breakout(ctx: AnalysisContext): Signal {
  const { candles, ind } = ctx;
  const i = candles.length - 1;
  const dc = ind.donchian;
  const upper = dc.upper[i], lower = dc.lower[i];
  const close = candles[i].close;
  const vol = candles[i].volume;
  const avgVol = candles.slice(-20).reduce((a, c) => a + c.volume, 0) / 20;
  const volSurge = vol > avgVol * 1.5;
  let side: Side = 'neutral';
  let confidence = 0.4;
  let reason = 'Inside Donchian channel';
  if (close > upper && !isNaN(upper)) {
    side = 'buy'; confidence = volSurge ? 0.62 : 0.5;
    reason = `Breakout above 20-bar high${volSurge ? ' with volume surge' : ''}`;
  } else if (close < lower && !isNaN(lower)) {
    side = 'sell'; confidence = volSurge ? 0.62 : 0.5;
    reason = `Breakdown below 20-bar low${volSurge ? ' with volume surge' : ''}`;
  }
  return { strategy: 'Breakout', category: 'breakout', side, confidence, reason };
}

// ---- Mean Reversion: Bollinger band touches + RSI extremes ----
function meanReversion(ctx: AnalysisContext): Signal {
  const { candles, ind } = ctx;
  const i = candles.length - 1;
  const bb = ind.bollinger;
  const rsi = ind.rsi[i];
  const close = candles[i].close;
  let side: Side = 'neutral';
  let confidence = 0.4;
  let reason = 'Price within Bollinger bands';
  if (close < bb.lower[i] && rsi < 30) {
    side = 'buy'; confidence = 0.58;
    reason = `Oversold: price below lower BB, RSI ${rsi?.toFixed(0)}`;
  } else if (close > bb.upper[i] && rsi > 70) {
    side = 'sell'; confidence = 0.58;
    reason = `Overbought: price above upper BB, RSI ${rsi?.toFixed(0)}`;
  }
  return { strategy: 'Mean Reversion', category: 'reversion', side, confidence, reason };
}

// ---- Momentum: ROC + MACD histogram + Stochastic ----
function momentum(ctx: AnalysisContext): Signal {
  const { candles, ind } = ctx;
  const i = candles.length - 1;
  const roc = ind.roc[i];
  const macdHist = ind.macd.hist[i];
  const stochK = last(ind.stochastic.k);
  let side: Side = 'neutral';
  let confidence = 0.4;
  let reason = 'Momentum flat';
  if (roc > 1 && macdHist > 0 && stochK > 50) {
    side = 'buy'; confidence = 0.55;
    reason = `Bullish momentum: ROC ${roc?.toFixed(1)}%, MACD+`;
  } else if (roc < -1 && macdHist < 0 && stochK < 50) {
    side = 'sell'; confidence = 0.55;
    reason = `Bearish momentum: ROC ${roc?.toFixed(1)}%, MACD-`;
  }
  return { strategy: 'Momentum', category: 'momentum', side, confidence, reason };
}

// ---- Swing: RSI divergence + structure swings ----
function swing(ctx: AnalysisContext): Signal {
  const { candles, ind, structure } = ctx;
  const rsi = ind.rsi;
  const events = structure.events.filter((e) => e.type === 'CHoCH' || e.type === 'BOS');
  const lastEvent = events[events.length - 1];
  let side: Side = 'neutral';
  let confidence = 0.4;
  let reason = 'No swing setup';
  if (lastEvent) {
    side = lastEvent.direction === 'bullish' ? 'buy' : 'sell';
    confidence = 0.52;
    reason = `${lastEvent.type} ${lastEvent.direction}`;
  }
  // RSI divergence overlay handled in patterns; here just signal.
  void candles; void rsi;
  return { strategy: 'Swing', category: 'swing', side, confidence, reason };
}

// ---- Scalping: fast EMA cross + PSAR flip ----
function scalping(ctx: AnalysisContext): Signal {
  const { candles, ind } = ctx;
  const i = candles.length - 1;
  const e9 = ind.ema[12][i], e21 = ind.ema[20][i];
  const psarNow = ind.psar[i];
  const close = candles[i].close;
  let side: Side = 'neutral';
  let confidence = 0.4;
  let reason = 'No scalp signal';
  if (e9 > e21 && close > psarNow) {
    side = 'buy'; confidence = 0.5;
    reason = 'Fast EMA above slow + PSAR bullish';
  } else if (e9 < e21 && close < psarNow) {
    side = 'sell'; confidence = 0.5;
    reason = 'Fast EMA below slow + PSAR bearish';
  }
  return { strategy: 'Scalping', category: 'scalp', side, confidence, reason };
}

// ---- Position: long-term EMA200 + Ichimoku cloud ----
function position(ctx: AnalysisContext): Signal {
  const { candles, ind } = ctx;
  const i = candles.length - 1;
  const ema200 = ind.ema[200][i];
  const close = candles[i].close;
  const tenkan = last(ind.ichimoku.tenkan);
  const kijun = last(ind.ichimoku.kijun);
  let side: Side = 'neutral';
  let confidence = 0.4;
  let reason = 'Below EMA200';
  if (!isNaN(ema200) && close > ema200 && tenkan > kijun) {
    side = 'buy'; confidence = 0.55;
    reason = 'Above EMA200 + Ichimoku tenkan>kijun (bullish)';
  } else if (!isNaN(ema200) && close < ema200 && tenkan < kijun) {
    side = 'sell'; confidence = 0.55;
    reason = 'Below EMA200 + Ichimoku tenkan<kijun (bearish)';
  }
  return { strategy: 'Position', category: 'position', side, confidence, reason };
}

// ---- Statistical Arbitrage: z-score of price vs VWAP ----
function statArb(ctx: AnalysisContext): Signal {
  const { candles, ind } = ctx;
  const i = candles.length - 1;
  const close = candles[i].close;
  const vwapNow = ind.vwap[i];
  const z = (close - vwapNow) / (ind.atr[i] || 1);
  let side: Side = 'neutral';
  let confidence = 0.4;
  let reason = `Price near VWAP (z=${z.toFixed(1)})`;
  if (z < -2) { side = 'buy'; confidence = 0.5; reason = `Price well below VWAP (z=${z.toFixed(1)}) — mean revert up`; }
  else if (z > 2) { side = 'sell'; confidence = 0.5; reason = `Price well above VWAP (z=${z.toFixed(1)}) — mean revert down`; }
  return { strategy: 'Stat Arbitrage', category: 'arb', side, confidence, reason };
}

// ---- Pairs: placeholder — requires a second instrument ----
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function pairs(_ctx: AnalysisContext): Signal {
  return { strategy: 'Pairs', category: 'pairs', side: 'neutral', confidence: 0.3, reason: 'Pairs trading requires a correlated instrument pair' };
}

// ---- Volatility: Bollinger squeeze breakout + ATR expansion ----
function volatility(ctx: AnalysisContext): Signal {
  const { candles, ind } = ctx;
  const i = candles.length - 1;
  const width = ind.bollinger.width;
  const lookback = width.slice(Math.max(0, i - 50), i);
  const minW = Math.min(...lookback);
  const isSqueeze = width[i] <= minW * 1.2;
  const close = candles[i].close;
  const mid = ind.bollinger.middle[i];
  let side: Side = 'neutral';
  let confidence = 0.4;
  let reason = 'Normal volatility';
  if (isSqueeze) {
    side = close > mid ? 'buy' : 'sell';
    confidence = 0.5;
    reason = 'Bollinger squeeze — volatility expansion pending';
  }
  return { strategy: 'Volatility', category: 'volatility', side, confidence, reason };
}

// ---- Smart Money: order block + FVG + premium/discount ----
function smartMoney(ctx: AnalysisContext): Signal {
  const { candles, smc } = ctx;
  const close = candles[candles.length - 1].close;
  let side: Side = 'neutral';
  let confidence = 0.4;
  let reason = 'No smart money confluence';
  // Discount zone + bullish OB → buy. Premium zone + bearish OB → sell.
  const inDiscount = close < smc.premiumDiscount.midpoint;
  const inPremium = close > smc.premiumDiscount.midpoint;
  const bullOB = smc.orderBlocks.filter((ob) => ob.side === 'bullish' && close >= ob.low && close <= ob.high);
  const bearOB = smc.orderBlocks.filter((ob) => ob.side === 'bearish' && close >= ob.low && close <= ob.high);
  if (inDiscount && bullOB.length) { side = 'buy'; confidence = 0.58; reason = 'Bullish order block in discount zone'; }
  else if (inPremium && bearOB.length) { side = 'sell'; confidence = 0.58; reason = 'Bearish order block in premium zone'; }
  else if (smc.fairValueGaps.length) {
    const lastFvg = smc.fairValueGaps[smc.fairValueGaps.length - 1];
    if (lastFvg.side === 'bullish' && close >= lastFvg.bottom && close <= lastFvg.top) {
      side = 'buy'; confidence = 0.5; reason = 'Price filling bullish FVG';
    } else if (lastFvg.side === 'bearish' && close >= lastFvg.bottom && close <= lastFvg.top) {
      side = 'sell'; confidence = 0.5; reason = 'Price filling bearish FVG';
    }
  }
  return { strategy: 'Smart Money', category: 'smc', side, confidence, reason };
}

// ---- Hybrid AI: blends all of the above weighted by regime ----
function hybridAI(ctx: AnalysisContext, ml: MLPrediction | null): Signal {
  const { structure } = ctx;
  // Delegate to the regime-appropriate strategy, then layer ML on top.
  const base = selectByRegime(ctx);
  let score = base.side === 'buy' ? base.confidence : base.side === 'sell' ? -base.confidence : 0;
  if (ml) {
    const mlVal = ml.prediction === 'up' ? 1 : ml.prediction === 'down' ? -1 : 0;
    score += mlVal * (ml.confidence === 'high' ? 0.25 : ml.confidence === 'medium' ? 0.15 : 0.08);
  }
  const side: Side = score > 0.15 ? 'buy' : score < -0.15 ? 'sell' : 'neutral';
  const confidence = Math.min(0.85, Math.abs(score) + 0.1);
  return {
    strategy: 'Hybrid AI',
    category: 'hybrid',
    side,
    confidence,
    reason: `${base.strategy} base (${structure.regime})${ml ? ' + ML blend' : ''}`,
  };
}

// ============================================================================
// AI strategy selector — chooses the best strategy for the current regime
// ============================================================================

const STRATEGY_FNS: Record<Exclude<StrategyName, 'hybrid_ai'>, (ctx: AnalysisContext) => Signal> = {
  trend_following: trendFollowing,
  breakout,
  mean_reversion: meanReversion,
  momentum,
  swing,
  scalping,
  position,
  stat_arb: statArb,
  pairs,
  volatility,
  smart_money: smartMoney,
};

export const STRATEGY_LABELS: Record<StrategyName, string> = {
  trend_following: 'Trend Following',
  breakout: 'Breakout Trading',
  mean_reversion: 'Mean Reversion',
  momentum: 'Momentum Trading',
  swing: 'Swing Trading',
  scalping: 'Scalping',
  position: 'Position Trading',
  stat_arb: 'Statistical Arbitrage',
  pairs: 'Pairs Trading',
  volatility: 'Volatility Trading',
  smart_money: 'Smart Money',
  hybrid_ai: 'Hybrid AI',
};

// Map regime → preferred strategy list (in priority order).
const REGIME_STRATEGY_MAP: Record<string, StrategyName[]> = {
  trend_up: ['trend_following', 'momentum', 'position', 'swing'],
  trend_down: ['trend_following', 'momentum', 'position', 'swing'],
  range: ['mean_reversion', 'stat_arb', 'pairs'],
  consolidation: ['volatility', 'breakout', 'mean_reversion'],
  expansion: ['breakout', 'momentum', 'volatility'],
};

function selectByRegime(ctx: AnalysisContext): Signal {
  const preferred = REGIME_STRATEGY_MAP[ctx.structure.regime] ?? ['trend_following'];
  for (const name of preferred) {
    const fn = STRATEGY_FNS[name as Exclude<StrategyName, 'hybrid_ai'>];
    if (!fn) continue;
    const sig = fn(ctx);
    if (sig.side !== 'neutral') return sig;
  }
  // Fallback: run trend following regardless.
  return STRATEGY_FNS.trend_following(ctx);
}

// Evaluate all strategies and return the AI-selected best one.
export function evaluateStrategies(
  candles: Candle[],
  ml: MLPrediction | null,
): { allSignals: Signal[]; selected: StrategyEvaluation; context: AnalysisContext } {
  const ind = computeIndicators(candles);
  const structure = analyzeMarketStructure(candles);
  const smc = analyzeSmartMoney(candles);
  const fib = computeFibonacci(candles);
  const ctx: AnalysisContext = { candles, ind, structure, smc, fib };

  // Run every strategy.
  const allSignals: Signal[] = Object.entries(STRATEGY_FNS).map(([, fn]) => fn(ctx));
  // Hybrid AI signal (uses ML).
  const hybrid = hybridAI(ctx, ml);
  allSignals.push(hybrid);

  // AI selection: pick the regime-preferred strategy with the strongest non-neutral signal.
  const preferred = REGIME_STRATEGY_MAP[structure.regime] ?? ['trend_following'];
  let best: StrategyEvaluation | null = null;
  for (const name of preferred) {
    const sig = allSignals.find((s) => s.category === labelToCategory(name as StrategyName));
    if (!sig || sig.side === 'neutral') continue;
    const score = (sig.side === 'buy' ? 1 : sig.side === 'sell' ? -1 : 0) * sig.confidence;
    if (!best || Math.abs(score) > Math.abs(best.score)) {
      best = {
        name: name as StrategyName,
        label: STRATEGY_LABELS[name as StrategyName],
        side: sig.side,
        confidence: sig.confidence,
        score,
        reason: sig.reason,
        inputs: [sig.strategy, `regime=${structure.regime}`, `ADX=${last(ind.adx).toFixed(0)}`],
      };
    }
  }
  // If no regime-preferred strategy fired, use hybrid AI as the selection.
  if (!best) {
    best = {
      name: 'hybrid_ai',
      label: 'Hybrid AI',
      side: hybrid.side,
      confidence: hybrid.confidence,
      score: (hybrid.side === 'buy' ? 1 : hybrid.side === 'sell' ? -1 : 0) * hybrid.confidence,
      reason: hybrid.reason,
      inputs: ['Hybrid blend', `regime=${structure.regime}`],
    };
  }
  return { allSignals, selected: best, context: ctx };
}

function labelToCategory(name: StrategyName): string {
  const map: Record<string, string> = {
    trend_following: 'trend', breakout: 'breakout', mean_reversion: 'reversion',
    momentum: 'momentum', swing: 'swing', scalping: 'scalp', position: 'position',
    stat_arb: 'arb', pairs: 'pairs', volatility: 'volatility', smart_money: 'smc',
  };
  return map[name] ?? name;
}

// Collect all chart overlays from signals + structure + SMC + Fibonacci for the chart.
export function collectOverlays(
  signals: Signal[],
  ctx: AnalysisContext,
  risk?: { stopLoss: number; takeProfit: number; entry: number },
): import('./types').Overlay[] {
  const overlays: import('./types').Overlay[] = [];
  // Signal overlays (dedupe by id).
  const seen = new Set<string>();
  for (const s of signals) {
    for (const ov of s.overlays ?? []) {
      if (!seen.has(ov.id)) { overlays.push(ov); seen.add(ov.id); }
    }
  }
  // Pattern overlays.
  const patterns = detectAllPatterns(ctx.candles);
  for (const p of patterns) {
    for (const ov of p.overlays ?? []) {
      if (!seen.has(ov.id)) { overlays.push(ov); seen.add(ov.id); }
    }
  }
  // Fibonacci hlines.
  if (ctx.fib) {
    for (const r of ctx.fib.retracements) {
      overlays.push({ type: 'hline', id: `fib-r-${r.level}`, price: r.price, color: r.level === 0.618 ? '#10a37f' : '#9ca3af', label: `Fib ${(r.level * 100).toFixed(1)}%` });
    }
    for (const e of ctx.fib.extensions) {
      overlays.push({ type: 'hline', id: `fib-e-${e.level}`, price: e.price, color: '#a855f7', label: `Ext ${(e.level * 100).toFixed(1)}%` });
    }
  }
  // SMC zones: order blocks and FVGs.
  for (const ob of ctx.smc.orderBlocks.slice(-3)) {
    overlays.push({ type: 'zone', id: `ob-${ob.index}`, from: ob.low, to: ob.high, color: ob.side === 'bullish' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', label: `${ob.side === 'bullish' ? 'Bull' : 'Bear'} OB` });
  }
  for (const fvg of ctx.smc.fairValueGaps.slice(-3)) {
    overlays.push({ type: 'zone', id: `fvg-${fvg.index}`, from: fvg.bottom, to: fvg.top, color: fvg.side === 'bullish' ? 'rgba(16,163,127,0.1)' : 'rgba(220,38,38,0.1)', label: 'FVG' });
  }
  // Risk lines.
  if (risk) {
    overlays.push({ type: 'hline', id: 'sl', price: risk.stopLoss, color: '#ef4444', label: 'SL' });
    overlays.push({ type: 'hline', id: 'tp', price: risk.takeProfit, color: '#22c55e', label: 'TP' });
    overlays.push({ type: 'hline', id: 'entry', price: risk.entry, color: '#10a37f', label: 'Entry' });
  }
  return overlays;
}
