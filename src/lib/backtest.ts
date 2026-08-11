import type { Candle, Side, BacktestMetrics, WalkForwardResult, MonteCarloResult } from './types';
import { atr } from './indicators';

// ============================================================================
// Backtesting Suite
// Walk-forward testing, Monte Carlo simulations, out-of-sample validation,
// Sharpe Ratio, Sortino Ratio, Profit Factor, Win Rate, Drawdown Analysis.
// ============================================================================

export interface BacktestConfig {
  hold: number;           // bars to hold each trade
  riskPerTrade: number;   // fraction of equity risked per trade
  riskReward: number;     // take-profit / stop ratio
  commissionPct: number;  // per-trade commission
}

export const DEFAULT_BACKTEST: BacktestConfig = {
  hold: 5,
  riskPerTrade: 0.01,
  riskReward: 2,
  commissionPct: 0.0006, // 0.06% per side, typical exchange taker fee
};

// Run a backtest with a signal-generating strategy function.
// Walks forward chronologically; at each bar generates a signal, enters at close,
// exits after `hold` bars (or at stop/target if hit first).
export function runBacktest(
  candles: Candle[],
  signalFn: (slice: Candle[]) => { side: Side; confidence: number } | null,
  config: BacktestConfig = DEFAULT_BACKTEST,
): BacktestMetrics {
  const equity = 100000;
  let balance = equity;
  const equityCurve: { time: number; equity: number }[] = [];
  const trades: BacktestMetrics['trades'] = [];
  let wins = 0, losses = 0;
  let grossWin = 0, grossLoss = 0;

  for (let i = 30; i < candles.length - config.hold; i++) {
    const slice = candles.slice(0, i + 1);
    const sig = signalFn(slice);
    if (!sig || sig.side === 'neutral') {
      equityCurve.push({ time: candles[i].time, equity: balance });
      continue;
    }
    const entry = candles[i].close;
    const a = atr(slice, 14);
    const atrVal = a[a.length - 1] || (entry * 0.01);
    const dir = sig.side === 'buy' ? 1 : -1;
    const stop = entry - dir * atrVal * 1.5;
    const target = entry + dir * atrVal * 1.5 * config.riskReward;
    const riskPerUnit = Math.abs(entry - stop);
    // Position size: risk fixed % of balance.
    const riskAmount = balance * config.riskPerTrade;
    const size = riskAmount / (riskPerUnit || 1);

    // Walk forward to exit: stop, target, or hold.
    let exit = candles[i + config.hold].close;
    let exitTime = candles[i + config.hold].time;
    let exitIndex = i + config.hold;
    for (let j = i + 1; j <= i + config.hold && j < candles.length; j++) {
      if (sig.side === 'buy' && candles[j].low <= stop) { exit = stop; exitTime = candles[j].time; exitIndex = j; break; }
      if (sig.side === 'buy' && candles[j].high >= target) { exit = target; exitTime = candles[j].time; exitIndex = j; break; }
      if (sig.side === 'sell' && candles[j].high >= stop) { exit = stop; exitTime = candles[j].time; exitIndex = j; break; }
      if (sig.side === 'sell' && candles[j].low <= target) { exit = target; exitTime = candles[j].time; exitIndex = j; break; }
    }
    const pnlRaw = (exit - entry) * dir * size;
    const commission = entry * size * config.commissionPct + exit * size * config.commissionPct;
    const pnl = pnlRaw - commission;
    const pnlPct = pnl / balance;
    balance += pnl;
    equityCurve.push({ time: candles[exitIndex].time, equity: balance });

    if (pnl > 0) { wins++; grossWin += pnl; }
    else { losses++; grossLoss += Math.abs(pnl); }
    trades.push({ entryTime: candles[i].time, exitTime, side: sig.side, entry, exit, pnl, pnlPct });
  }

  if (equityCurve.length === 0) {
    equityCurve.push({ time: candles[0]?.time ?? 0, equity });
  }

  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;
  const avgWin = wins > 0 ? grossWin / wins : 0;
  const avgLoss = losses > 0 ? grossLoss / losses : 0;
  const expectancy = totalTrades > 0 ? (balance - equity) / totalTrades : 0;

  // Sharpe: mean return / std return, annualized by sqrt(bars per year approximation).
  const returns = trades.map((t) => t.pnlPct);
  const sharpe = calcSharpe(returns);
  const sortino = calcSortino(returns);
  const maxDrawdown = calcMaxDrawdown(equityCurve);

  return {
    totalTrades, winRate, profitFactor, sharpe, sortino, maxDrawdown,
    avgWin, avgLoss, expectancy, equityCurve, trades,
  };
}

function calcSharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  // Annualization factor: ~252 trading days, ~24 bars/day for 1h → rough sqrt(252)
  return (mean / std) * Math.sqrt(252);
}

function calcSortino(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const downside = returns.filter((r) => r < 0).map((r) => r ** 2);
  if (downside.length === 0) return 0;
  const downsideDev = Math.sqrt(downside.reduce((a, b) => a + b, 0) / downside.length);
  if (downsideDev === 0) return 0;
  return (mean / downsideDev) * Math.sqrt(252);
}

function calcMaxDrawdown(curve: { time: number; equity: number }[]): number {
  let peak = curve[0]?.equity ?? 0;
  let maxDD = 0;
  for (const p of curve) {
    if (p.equity > peak) peak = p.equity;
    const dd = (peak - p.equity) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

// Walk-forward testing: split data into in-sample (first 70%) and out-of-sample (last 30%).
// Run the strategy on both, compare efficiency.
export function walkForward(
  candles: Candle[],
  signalFn: (slice: Candle[]) => { side: Side; confidence: number } | null,
  config: BacktestConfig = DEFAULT_BACKTEST,
): WalkForwardResult {
  const split = Math.floor(candles.length * 0.7);
  // In-sample needs a warmup of 30 bars at the front; out-of-sample re-slices from 0.
  const inSample = runBacktest(candles.slice(0, split), signalFn, config);
  const outOfSample = runBacktest(candles, signalFn, config);
  // Efficiency: OOS expectancy / IS expectancy (how well does IS performance persist?).
  const isReturn = inSample.equityCurve.length > 1
    ? (inSample.equityCurve[inSample.equityCurve.length - 1].equity - inSample.equityCurve[0].equity) / inSample.equityCurve[0].equity
    : 0;
  const oosReturn = outOfSample.equityCurve.length > 1
    ? (outOfSample.equityCurve[outOfSample.equityCurve.length - 1].equity - outOfSample.equityCurve[split].equity) / outOfSample.equityCurve[split].equity
    : 0;
  const efficiency = isReturn !== 0 ? oosReturn / isReturn : 0;
  return { inSample, outOfSample, efficiency };
}

// Monte Carlo simulation: resample the trade sequence with replacement N times
// to estimate the distribution of returns and worst-case drawdown.
export function monteCarlo(
  metrics: BacktestMetrics,
  simulations = 1000,
): MonteCarloResult {
  if (metrics.trades.length < 5) {
    return { medianReturn: 0, p5Return: 0, p95Return: 0, medianMaxDrawdown: 0, worstMaxDrawdown: 0, ruinProbability: 0, simulations, sampleCurves: [] };
  }
  const returns = metrics.trades.map((t) => t.pnlPct);
  const finalReturns: number[] = [];
  const maxDrawdowns: number[] = [];
  const sampleCurves: { time: number; equity: number }[][] = [];
  const startingEquity = 100000;

  for (let s = 0; s < simulations; s++) {
    let equity = startingEquity;
    const curve: { time: number; equity: number }[] = [{ time: 0, equity }];
    let peak = equity;
    let maxDD = 0;

    for (let i = 0; i < returns.length; i++) {
      // Random trade from the sequence.
      const r = returns[Math.floor(Math.random() * returns.length)];
      equity *= (1 + r);
      if (equity > peak) peak = equity;
      const dd = (peak - equity) / peak;
      if (dd > maxDD) maxDD = dd;
      if (equity <= startingEquity * 0.5) { break; }
      curve.push({ time: i + 1, equity });
    }
    finalReturns.push((equity - startingEquity) / startingEquity);
    maxDrawdowns.push(maxDD);
    if (s < 20) sampleCurves.push(curve);
  }

  finalReturns.sort((a, b) => a - b);
  maxDrawdowns.sort((a, b) => a - b);
  const ruinProbability = finalReturns.filter((r) => r <= -0.5).length / simulations;

  return {
    medianReturn: finalReturns[Math.floor(simulations * 0.5)],
    p5Return: finalReturns[Math.floor(simulations * 0.05)],
    p95Return: finalReturns[Math.floor(simulations * 0.95)],
    medianMaxDrawdown: maxDrawdowns[Math.floor(simulations * 0.5)],
    worstMaxDrawdown: maxDrawdowns[simulations - 1],
    ruinProbability,
    simulations,
    sampleCurves,
  };
}
