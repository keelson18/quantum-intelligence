import type { PaperPosition, PaperTrade } from './paperTrading';
import { computeUnrealizedPnL } from './paperTrading';

// ============================================================================
// Portfolio Analytics Engine
// Computes performance metrics from paper trading history:
// win rate, profit factor, Sharpe, Sortino, max drawdown, equity curve,
// daily/weekly/monthly P&L, exposure analysis.
// ============================================================================

export interface PortfolioMetrics {
  totalReturn: number;
  totalReturnPct: number;
  winRate: number;
  profitFactor: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  totalTrades: number;
  wins: number;
  losses: number;
  bestTrade: number;
  worstTrade: number;
  avgHoldHours: number;
  equityCurve: { time: string; equity: number }[];
  dailyPnl: { [key: string]: string | number }[];
  weeklyPnl: { [key: string]: string | number }[];
  monthlyPnl: { [key: string]: string | number }[];
}

export interface ExposureAnalysis {
  byAsset: { symbol: string; label: string; value: number; pct: number; side: string }[];
  bySide: { long: number; short: number };
  totalExposure: number;
  netExposure: number;
  positionCount: number;
}

export const STARTING_EQUITY = 100_000;

// ---- Compute full portfolio metrics from trade history ----
export function computePortfolioMetrics(
  trades: PaperTrade[],
  startingEquity: number = STARTING_EQUITY,
): PortfolioMetrics {
  if (trades.length === 0) {
    return {
      totalReturn: 0, totalReturnPct: 0, winRate: 0, profitFactor: 0,
      sharpe: 0, sortino: 0, maxDrawdown: 0, avgWin: 0, avgLoss: 0,
      expectancy: 0, totalTrades: 0, wins: 0, losses: 0,
      bestTrade: 0, worstTrade: 0, avgHoldHours: 0,
      equityCurve: [{ time: new Date().toISOString(), equity: startingEquity }],
      dailyPnl: [], weeklyPnl: [], monthlyPnl: [],
    };
  }

  const sorted = [...trades].sort((a, b) => new Date(a.exit_time).getTime() - new Date(b.exit_time).getTime());

  let equity = startingEquity;
  const equityCurve: { time: string; equity: number }[] = [
    { time: sorted[0].entry_time, equity },
  ];

  let wins = 0, losses = 0;
  let grossWin = 0, grossLoss = 0;
  let bestTrade = -Infinity, worstTrade = Infinity;
  let totalHoldHours = 0;

  const returns: number[] = [];

  for (const t of sorted) {
    equity += t.pnl;
    equityCurve.push({ time: t.exit_time, equity });
    returns.push(t.pnl_pct);

    if (t.pnl > 0) { wins++; grossWin += t.pnl; }
    else { losses++; grossLoss += Math.abs(t.pnl); }

    bestTrade = Math.max(bestTrade, t.pnl);
    worstTrade = Math.min(worstTrade, t.pnl);
    totalHoldHours += t.hold_duration_hours;
  }

  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;
  const avgWin = wins > 0 ? grossWin / wins : 0;
  const avgLoss = losses > 0 ? grossLoss / losses : 0;
  const expectancy = totalTrades > 0 ? (grossWin - grossLoss) / totalTrades : 0;
  const totalReturn = equity - startingEquity;
  const totalReturnPct = startingEquity > 0 ? totalReturn / startingEquity : 0;

  const sharpe = calcSharpe(returns);
  const sortino = calcSortino(returns);
  const maxDrawdown = calcMaxDrawdown(equityCurve);

  const dailyPnl = aggregatePnlBy(sorted, (t) => t.exit_time.slice(0, 10), 'date');
  const weeklyPnl = aggregatePnlBy(sorted, (t) => {
    const d = new Date(t.exit_time);
    const week = getISOWeek(d);
    return `${d.getFullYear()}-W${week}`;
  }, 'week');
  const monthlyPnl = aggregatePnlBy(sorted, (t) => t.exit_time.slice(0, 7), 'month');

  return {
    totalReturn, totalReturnPct, winRate, profitFactor,
    sharpe, sortino, maxDrawdown, avgWin, avgLoss,
    expectancy, totalTrades, wins, losses,
    bestTrade: bestTrade === -Infinity ? 0 : bestTrade,
    worstTrade: worstTrade === Infinity ? 0 : worstTrade,
    avgHoldHours: totalTrades > 0 ? totalHoldHours / totalTrades : 0,
    equityCurve, dailyPnl, weeklyPnl, monthlyPnl,
  };
}

// ---- Compute exposure from open positions + live prices ----
export function computeExposure(
  positions: PaperPosition[],
  prices: Record<string, number>,
  equity: number = STARTING_EQUITY,
): ExposureAnalysis {
  const byAsset: ExposureAnalysis['byAsset'] = [];
  let longValue = 0, shortValue = 0;

  for (const pos of positions) {
    const price = prices[pos.symbol] ?? pos.entry_price;
    const value = pos.quantity * price;
    byAsset.push({
      symbol: pos.symbol,
      label: pos.label,
      value,
      pct: equity > 0 ? value / equity : 0,
      side: pos.side,
    });
    if (pos.side === 'long') longValue += value;
    else shortValue += value;
  }

  byAsset.sort((a, b) => b.value - a.value);

  return {
    byAsset,
    bySide: { long: longValue, short: shortValue },
    totalExposure: longValue + shortValue,
    netExposure: longValue - shortValue,
    positionCount: positions.length,
  };
}

// ---- Compute total unrealized P&L across all open positions ----
export function computeTotalUnrealizedPnL(
  positions: PaperPosition[],
  prices: Record<string, number>,
): { totalPnl: number; totalPnlPct: number } {
  let totalPnl = 0;
  let totalCost = 0;
  for (const pos of positions) {
    const price = prices[pos.symbol] ?? pos.entry_price;
    const { pnl } = computeUnrealizedPnL(pos, price);
    totalPnl += pnl;
    totalCost += pos.entry_price * pos.quantity;
  }
  return { totalPnl, totalPnlPct: totalCost > 0 ? totalPnl / totalCost : 0 };
}

// ============================================================================
// Helpers
// ============================================================================

function calcSharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (mean / std) * Math.sqrt(252);
}

function calcSortino(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const downside = returns.filter((r) => r < 0).map((r) => r ** 2);
  if (downside.length === 0) return 0;
  const dd = Math.sqrt(downside.reduce((a, b) => a + b, 0) / downside.length);
  if (dd === 0) return 0;
  return (mean / dd) * Math.sqrt(252);
}

function calcMaxDrawdown(curve: { equity: number }[]): number {
  let peak = curve[0]?.equity ?? 0;
  let maxDD = 0;
  for (const p of curve) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak > 0 ? (peak - p.equity) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function aggregatePnlBy(
  trades: PaperTrade[],
  keyFn: (t: PaperTrade) => string,
  label: string,
): { [key: string]: string | number }[] {
  const map: Record<string, number> = {};
  for (const t of trades) {
    const key = keyFn(t);
    map[key] = (map[key] ?? 0) + t.pnl;
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, pnl]) => ({ [label]: key, pnl }));
}

function getISOWeek(d: Date): string {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return String(1 + Math.round(((date.getTime() - week1.getTime()) / 86_400_000 - 3 + ((week1.getDay() + 6) % 7)) / 7)).padStart(2, '0');
}
