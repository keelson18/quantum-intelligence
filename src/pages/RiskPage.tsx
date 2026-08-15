import { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, RefreshCw, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { fetchKlines } from '../lib/binance';
import { assessRisk, DEFAULT_PORTFOLIO, type PortfolioState } from '../lib/risk';
import { CRYPTO_INSTRUMENTS, type Timeframe } from '../lib/types';
import { getRiskState, saveRiskState } from '../lib/data/risk.repo';
import { useAuth } from '../context/AuthContext';

interface RiskRow {
  symbol: string;
  label: string;
  price: number;
  atr: number;
  atrPct: number;
  side: 'buy' | 'sell';
  kelly: number;
  positionValue: number;
  stopLoss: number;
  takeProfit: number;
  riskPerTrade: number;
  riskReward: number;
}

export default function RiskPage() {
  const { user } = useAuth();
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [rows, setRows] = useState<RiskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [portfolio, setPortfolio] = useState<PortfolioState>(DEFAULT_PORTFOLIO);

  // Load persisted risk state
  useEffect(() => {
    if (!user) return;
    (async () => {
      const data = await getRiskState(user.id);
      if (data) {
        setPortfolio({
          equity: data.equity,
          startingEquity: data.starting_equity,
          dailyLossUsed: data.daily_loss_used ?? 0,
          maxDailyLossPct: data.max_daily_loss_pct ?? DEFAULT_PORTFOLIO.maxDailyLossPct,
          maxDrawdownPct: data.max_drawdown_pct ?? DEFAULT_PORTFOLIO.maxDrawdownPct,
          peakEquity: data.peak_equity,
          currentExposurePct: data.current_exposure_pct ?? 0,
          maxExposurePct: data.max_exposure_pct ?? DEFAULT_PORTFOLIO.maxExposurePct,
          openPositions: DEFAULT_PORTFOLIO.openPositions,
        });
      }
    })();
  }, [user]);

  // Persist risk state when portfolio changes
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      void saveRiskState(user.id, {
        equity: portfolio.equity,
        startingEquity: portfolio.startingEquity,
        maxDailyLossPct: portfolio.maxDailyLossPct,
        maxDrawdownPct: portfolio.maxDrawdownPct,
        maxExposurePct: portfolio.maxExposurePct,
        peakEquity: portfolio.peakEquity,
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [user, portfolio]);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    const symbols = CRYPTO_INSTRUMENTS.filter((i) => i.live).slice(0, 8).map((i) => i.symbol);
    const results: RiskRow[] = [];
    for (let i = 0; i < symbols.length; i += 4) {
      const batch = symbols.slice(i, i + 4);
      await Promise.all(batch.map(async (sym) => {
        try {
          const candles = await fetchKlines(sym, timeframe, 200);
          if (candles.length < 60) return;
          // Determine side from recent price action for realistic risk assessment
          const recent = candles.slice(-20);
          const change = (recent[recent.length - 1].close - recent[0].close) / recent[0].close;
          const side: 'buy' | 'sell' = change >= 0 ? 'buy' : 'sell';
          const confidence = Math.min(0.85, 0.5 + Math.abs(change) * 2);
          const risk = assessRisk(candles, side, confidence, portfolio);
          if (!risk) return;
          results.push({
            symbol: sym,
            label: CRYPTO_INSTRUMENTS.find((c) => c.symbol === sym)?.label ?? sym,
            price: risk.entry,
            atr: risk.atr,
            atrPct: (risk.atr / risk.entry) * 100,
            side,
            kelly: risk.kellyFraction,
            positionValue: risk.positionValue,
            stopLoss: risk.stopLoss,
            takeProfit: risk.takeProfit,
            riskPerTrade: risk.riskPerTrade,
            riskReward: risk.riskReward,
          });
        } catch { /* skip */ }
      }));
    }
    setRows(results.sort((a, b) => b.atrPct - a.atrPct));
    setLoading(false);
  }, [timeframe, portfolio]);

  useEffect(() => { runAnalysis(); }, [runAnalysis]);

  const totalExposure = rows.reduce((sum, r) => sum + r.positionValue, 0);
  const totalRisk = rows.reduce((sum, r) => sum + r.riskPerTrade, 0);
  const avgKelly = rows.length ? rows.reduce((sum, r) => sum + r.kelly, 0) / rows.length : 0;
  const maxDailyLoss = portfolio.equity * portfolio.maxDailyLossPct;
  const currentDrawdown = (portfolio.peakEquity - portfolio.equity) / portfolio.peakEquity;
  const longExposure = rows.filter((r) => r.side === 'buy').reduce((s, r) => s + r.positionValue, 0);
  const shortExposure = rows.filter((r) => r.side === 'sell').reduce((s, r) => s + r.positionValue, 0);

  return (
    <div className="px-4 lg:px-6 py-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">Risk Center</h1>
          <p className="text-xs text-muted mt-0.5">Kelly Criterion sizing, exposure limits, and volatility-adjusted stops</p>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4 mb-4">
        <h3 className="text-xs font-semibold mb-3">Portfolio Risk Parameters</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted">Equity ($)</label>
            <input type="number" value={portfolio.equity}
              onChange={(e) => setPortfolio({ ...portfolio, equity: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm tabular-nums focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs text-muted">Max Daily Loss (%)</label>
            <input type="number" step="0.5" value={portfolio.maxDailyLossPct * 100}
              onChange={(e) => setPortfolio({ ...portfolio, maxDailyLossPct: (parseFloat(e.target.value) || 0) / 100 })}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm tabular-nums focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs text-muted">Max Drawdown (%)</label>
            <input type="number" step="1" value={portfolio.maxDrawdownPct * 100}
              onChange={(e) => setPortfolio({ ...portfolio, maxDrawdownPct: (parseFloat(e.target.value) || 0) / 100 })}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm tabular-nums focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs text-muted">Max Exposure (%)</label>
            <input type="number" step="5" value={portfolio.maxExposurePct * 100}
              onChange={(e) => setPortfolio({ ...portfolio, maxExposurePct: (parseFloat(e.target.value) || 0) / 100 })}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-sm tabular-nums focus:outline-none focus:border-primary" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
        <RiskCard label="Total Exposure" value={`$${totalExposure.toFixed(0)}`} sub={`${((totalExposure / portfolio.equity) * 100).toFixed(1)}% of equity`} />
        <RiskCard label="Total Risk" value={`$${totalRisk.toFixed(0)}`} sub={`${((totalRisk / portfolio.equity) * 100).toFixed(1)}% at risk`} warn={totalRisk > maxDailyLoss} />
        <RiskCard label="Avg Kelly" value={`${(avgKelly * 100).toFixed(1)}%`} sub="Quarter-Kelly cap" />
        <RiskCard label="Daily Loss Limit" value={`$${maxDailyLoss.toFixed(0)}`} sub={`${(portfolio.maxDailyLossPct * 100).toFixed(1)}% max`} />
        <RiskCard label="Current DD" value={`${(currentDrawdown * 100).toFixed(1)}%`} sub={`Limit ${(portfolio.maxDrawdownPct * 100).toFixed(0)}%`} warn={currentDrawdown > portfolio.maxDrawdownPct * 0.8} />
        <RiskCard label="Long/Short" value={`${longExposure.toFixed(0)}/${shortExposure.toFixed(0)}`} sub="Exposure split" />
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="flex gap-1 p-1 rounded-lg bg-surface border border-border">
          {(['1h', '4h', '1d'] as Timeframe[]).map((tf) => (
            <button key={tf} onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${timeframe === tf ? 'bg-primary text-black' : 'text-muted hover:text-text'}`}>
              {tf}
            </button>
          ))}
        </div>
        <button onClick={runAnalysis} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 text-xs font-medium disabled:opacity-40 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Analyzing…' : 'Refresh'}
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="py-12 text-center text-muted text-sm flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Computing risk metrics…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-muted text-sm">No data available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="text-left px-4 py-2.5 font-medium">Instrument</th>
                  <th className="text-center px-4 py-2.5 font-medium">Side</th>
                  <th className="text-right px-4 py-2.5 font-medium">Price</th>
                  <th className="text-right px-4 py-2.5 font-medium">ATR</th>
                  <th className="text-right px-4 py-2.5 font-medium">ATR %</th>
                  <th className="text-right px-4 py-2.5 font-medium">Kelly</th>
                  <th className="text-right px-4 py-2.5 font-medium">Pos Value</th>
                  <th className="text-right px-4 py-2.5 font-medium">Stop Loss</th>
                  <th className="text-right px-4 py-2.5 font-medium">Take Profit</th>
                  <th className="text-right px-4 py-2.5 font-medium">Risk $</th>
                  <th className="text-right px-4 py-2.5 font-medium">R:R</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.symbol} className="border-b border-border/50 hover:bg-bg/50 transition-colors">
                    <td className="px-4 py-2.5 font-medium">{r.label}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        r.side === 'buy' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                      }`}>
                        {r.side === 'buy' ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        {r.side === 'buy' ? 'Long' : 'Short'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">${r.price.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.atr.toFixed(2)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.atrPct > 5 ? 'text-warning' : ''}`}>{r.atrPct.toFixed(2)}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{(r.kelly * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">${r.positionValue.toFixed(0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-danger">${r.stopLoss.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-success">${r.takeProfit.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">${r.riskPerTrade.toFixed(0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.riskReward.toFixed(2)}</td>
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

function RiskCard({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className={`bg-surface border rounded-xl p-4 ${warn ? 'border-danger/30' : 'border-border'}`}>
      <div className="text-xs text-muted mb-1 flex items-center gap-1">
        {warn && <AlertTriangle className="w-3 h-3 text-danger" />} {label}
      </div>
      <div className={`text-lg font-semibold tabular-nums ${warn ? 'text-danger' : ''}`}>{value}</div>
      <div className="text-xs text-muted mt-0.5">{sub}</div>
    </div>
  );
}
