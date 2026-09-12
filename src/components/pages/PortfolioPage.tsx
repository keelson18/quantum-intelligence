import { useState, useEffect, useCallback } from 'react';
import { Wallet, TrendingUp, TrendingDown, X, BarChart3, Clock } from 'lucide-react';
import { fetchOpenPositions, fetchTradeHistory, closePosition, type PaperPosition, type PaperTrade } from '../lib/paperTrading';
import { computePortfolioMetrics, computeExposure, computeTotalUnrealizedPnL, STARTING_EQUITY } from '../lib/portfolioEngine';
import { subscribeLivePrice } from '../lib/market';

export default function PortfolioPage() {
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    const [open, history] = await Promise.all([fetchOpenPositions(), fetchTradeHistory(200)]);
    setPositions(open);
    setTrades(history);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const positionSymbols = [...new Set(positions.map((p) => p.symbol))];
  useEffect(() => {
    if (positionSymbols.length === 0) return;
    const unsub = subscribeLivePrice(positionSymbols, (sym, price) => {
      setLivePrices((prev) => ({ ...prev, [sym]: price }));
    });
    return () => unsub();
  }, [positionSymbols.join(',')]);

  const handleClose = async (id: string) => {
    const pos = positions.find((p) => p.id === id);
    if (!pos) return;
    const price = livePrices[pos.symbol] ?? pos.entry_price;
    await closePosition(id, price, 'manual');
    loadData();
  };

  const metrics = computePortfolioMetrics(trades);
  const exposure = computeExposure(positions, livePrices, STARTING_EQUITY);
  const unrealized = computeTotalUnrealizedPnL(positions, livePrices);
  const currentEquity = STARTING_EQUITY + metrics.totalReturn + unrealized.totalPnl;

  const livePositions = positions.map((p) => {
    const price = livePrices[p.symbol] ?? p.entry_price;
    const dir = p.side === 'long' ? 1 : -1;
    const pnl = (price - p.entry_price) * dir * p.quantity;
    const pnlPct = p.entry_price > 0 ? ((price - p.entry_price) * dir) / p.entry_price : 0;
    return { ...p, currentPrice: price, pnl, pnlPct };
  });

  if (loading) {
    return <div className="px-4 lg:px-6 py-12 text-center text-muted text-sm">Loading portfolio…</div>;
  }

  return (
    <div className="px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">Portfolio</h1>
          <p className="text-xs text-muted mt-0.5">Paper trading positions, analytics & performance</p>
        </div>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricCard label="Equity" value={`$${currentEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <MetricCard label="Total Return" value={`${metrics.totalReturn >= 0 ? '+' : ''}$${metrics.totalReturn.toFixed(0)}`} sub={`${(metrics.totalReturnPct * 100).toFixed(1)}%`} positive={metrics.totalReturn >= 0} />
        <MetricCard label="Unrealized P&L" value={`${unrealized.totalPnl >= 0 ? '+' : ''}$${unrealized.totalPnl.toFixed(0)}`} positive={unrealized.totalPnl >= 0} />
        <MetricCard label="Win Rate" value={`${(metrics.winRate * 100).toFixed(1)}%`} sub={`${metrics.wins}W / ${metrics.losses}L`} />
        <MetricCard label="Profit Factor" value={metrics.profitFactor.toFixed(2)} positive={metrics.profitFactor >= 1} />
        <MetricCard label="Max Drawdown" value={`${(metrics.maxDrawdown * 100).toFixed(1)}%`} negative />
      </div>

      {/* Performance metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricCard label="Sharpe" value={metrics.sharpe.toFixed(2)} icon={<BarChart3 className="w-3 h-3" />} />
        <MetricCard label="Sortino" value={metrics.sortino.toFixed(2)} />
        <MetricCard label="Expectancy" value={`$${metrics.expectancy.toFixed(0)}`} positive={metrics.expectancy >= 0} />
        <MetricCard label="Avg Win" value={`$${metrics.avgWin.toFixed(0)}`} positive />
        <MetricCard label="Avg Loss" value={`$${metrics.avgLoss.toFixed(0)}`} negative />
        <MetricCard label="Avg Hold" value={`${metrics.avgHoldHours.toFixed(1)}h`} icon={<Clock className="w-3 h-3" />} />
      </div>

      {/* Equity curve */}
      {metrics.equityCurve.length > 1 && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-xs font-semibold mb-3">Equity Curve</h3>
          <EquityCurve chart={metrics.equityCurve} />
        </div>
      )}

      {/* Exposure analysis */}
      {exposure.positionCount > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-xs font-semibold mb-3">Exposure Analysis</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <div className="text-xs text-muted">Total Exposure</div>
              <div className="text-lg font-semibold tabular-nums">${exposure.totalExposure.toFixed(0)}</div>
            </div>
            <div>
              <div className="text-xs text-muted flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Long</div>
              <div className="text-lg font-semibold tabular-nums text-success">${exposure.bySide.long.toFixed(0)}</div>
            </div>
            <div>
              <div className="text-xs text-muted flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Short</div>
              <div className="text-lg font-semibold tabular-nums text-danger">${exposure.bySide.short.toFixed(0)}</div>
            </div>
          </div>
          {exposure.byAsset.length > 0 && (
            <div className="space-y-1.5">
              {exposure.byAsset.map((a) => (
                <div key={a.symbol} className="flex items-center gap-3 text-xs">
                  <span className="font-medium w-20 truncate">{a.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-bg overflow-hidden">
                    <div className={`h-full ${a.side === 'long' ? 'bg-success' : 'bg-danger'}`} style={{ width: `${Math.min(100, a.pct * 100)}%` }} />
                  </div>
                  <span className="tabular-nums text-muted w-20 text-right">${a.value.toFixed(0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Open positions */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <h3 className="text-xs font-semibold px-4 py-3 border-b border-border">Open Positions</h3>
        {livePositions.length === 0 ? (
          <div className="py-10 text-center text-muted text-sm">No open positions. Execute trades from the Terminal.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="text-left px-4 py-2.5 font-medium">Symbol</th>
                  <th className="text-center px-4 py-2.5 font-medium">Side</th>
                  <th className="text-right px-4 py-2.5 font-medium">Entry</th>
                  <th className="text-right px-4 py-2.5 font-medium">Current</th>
                  <th className="text-right px-4 py-2.5 font-medium">Qty</th>
                  <th className="text-right px-4 py-2.5 font-medium">SL</th>
                  <th className="text-right px-4 py-2.5 font-medium">TP</th>
                  <th className="text-right px-4 py-2.5 font-medium">P&L</th>
                  <th className="text-right px-4 py-2.5 font-medium">P&L %</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {livePositions.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-bg/50 transition-colors">
                    <td className="px-4 py-2.5 font-medium">{p.label}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${p.side === 'long' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
                        {p.side}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">${p.entry_price.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {livePrices[p.symbol] ? <span className="text-primary">${p.currentPrice.toFixed(2)}</span> : `$${p.currentPrice.toFixed(2)}`}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{p.quantity}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-danger/70">{p.stop_loss ? `$${p.stop_loss.toFixed(2)}` : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-success/70">{p.take_profit ? `$${p.take_profit.toFixed(2)}` : '—'}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${p.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                      {p.pnl >= 0 ? '+' : ''}${p.pnl.toFixed(2)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${p.pnlPct >= 0 ? 'text-success' : 'text-danger'}`}>
                      {p.pnlPct >= 0 ? '+' : ''}{(p.pnlPct * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => handleClose(p.id)} className="text-muted hover:text-danger transition-colors" title="Close position">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trade history */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <h3 className="text-xs font-semibold px-4 py-3 border-b border-border">Trade History</h3>
        {trades.length === 0 ? (
          <div className="py-10 text-center text-muted text-sm">No closed trades yet.</div>
        ) : (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-muted">
                  <th className="text-left px-4 py-2.5 font-medium">Symbol</th>
                  <th className="text-center px-4 py-2.5 font-medium">Side</th>
                  <th className="text-right px-4 py-2.5 font-medium">Entry</th>
                  <th className="text-right px-4 py-2.5 font-medium">Exit</th>
                  <th className="text-right px-4 py-2.5 font-medium">P&L</th>
                  <th className="text-right px-4 py-2.5 font-medium">P&L %</th>
                  <th className="text-center px-4 py-2.5 font-medium">Reason</th>
                  <th className="text-left px-4 py-2.5 font-medium">Strategy</th>
                  <th className="text-right px-4 py-2.5 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-bg/50 transition-colors">
                    <td className="px-4 py-2 font-medium">{t.label}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${t.side === 'long' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
                        {t.side}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">${t.entry_price.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">${t.exit_price.toFixed(2)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${t.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                      {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${t.pnl_pct >= 0 ? 'text-success' : 'text-danger'}`}>
                      {t.pnl_pct >= 0 ? '+' : ''}{(t.pnl_pct * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-2 text-center text-muted">{t.exit_reason.replace('_', ' ')}</td>
                    <td className="px-4 py-2 text-muted">{t.strategy ?? '—'}</td>
                    <td className="px-4 py-2 text-right text-muted tabular-nums">{new Date(t.exit_time).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, positive, negative, icon }: { label: string; value: string; sub?: string; positive?: boolean; negative?: boolean; icon?: React.ReactNode }) {
  const color = positive ? 'text-success' : negative ? 'text-danger' : 'text-text';
  return (
    <div className="bg-surface border border-border rounded-xl p-3">
      <div className="text-xs text-muted mb-1 flex items-center gap-1">{icon}{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5 tabular-nums">{sub}</div>}
    </div>
  );
}

function EquityCurve({ chart }: { chart: { time: string; equity: number }[] }) {
  if (chart.length < 2) return <div className="text-xs text-muted py-4">Not enough data</div>;
  const vals = chart.map((p) => p.equity);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const w = 800, h = 100;
  const points = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={up ? '#22c55e' : '#ef4444'} strokeWidth="1.5" />
    </svg>
  );
}
