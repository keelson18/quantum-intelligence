import { useState, useEffect, useCallback } from 'react';
import { ScanSearch, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { fetchKlines } from '../lib/binance';
import { detectAllPatterns } from '../lib/patterns';
import { CRYPTO_INSTRUMENTS, type Timeframe, type PatternHit } from '../lib/types';

interface PatternScanRow {
  symbol: string;
  label: string;
  price: number;
  patterns: PatternHit[];
  topPattern: PatternHit | null;
  bullishCount: number;
  bearishCount: number;
}

export default function PatternsPage() {
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [rows, setRows] = useState<PatternScanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'chart' | 'candlestick' | 'buy' | 'sell'>('all');

  const runScan = useCallback(async () => {
    setLoading(true);
    const symbols = CRYPTO_INSTRUMENTS.filter((i) => i.live).map((i) => i.symbol);
    const results: PatternScanRow[] = [];
    for (let i = 0; i < symbols.length; i += 4) {
      const batch = symbols.slice(i, i + 4);
      await Promise.all(batch.map(async (sym) => {
        try {
          const candles = await fetchKlines(sym, timeframe, 300);
          if (candles.length < 60) return;
          const patterns = detectAllPatterns(candles);
          if (patterns.length === 0) return;
          const sorted = [...patterns].sort((a, b) => b.confidence - a.confidence);
          results.push({
            symbol: sym,
            label: CRYPTO_INSTRUMENTS.find((c) => c.symbol === sym)?.label ?? sym,
            price: candles[candles.length - 1].close,
            patterns,
            topPattern: sorted[0],
            bullishCount: patterns.filter((p) => p.side === 'buy').length,
            bearishCount: patterns.filter((p) => p.side === 'sell').length,
          });
        } catch { /* skip */ }
      }));
    }
    setRows(results);
    setLoading(false);
  }, [timeframe]);

  useEffect(() => { runScan(); }, [runScan]);

  const filtered = rows.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'chart') return r.patterns.some((p) => p.kind === 'chart');
    if (filter === 'candlestick') return r.patterns.some((p) => p.kind === 'candlestick');
    if (filter === 'buy') return r.patterns.some((p) => p.side === 'buy');
    if (filter === 'sell') return r.patterns.some((p) => p.side === 'sell');
    return true;
  });

  return (
    <div className="px-4 lg:px-6 py-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <ScanSearch className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">Pattern Scanner</h1>
          <p className="text-xs text-muted mt-0.5">Scanning all instruments for chart and candlestick patterns</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 p-1 rounded-lg bg-surface border border-border">
          {(['15m', '1h', '4h', '1d'] as Timeframe[]).map((tf) => (
            <button key={tf} onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${timeframe === tf ? 'bg-primary text-black' : 'text-muted hover:text-text'}`}>
              {tf}
            </button>
          ))}
        </div>
        <button onClick={runScan} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 text-xs font-medium disabled:opacity-40 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Scanning…' : 'Rescan'}
        </button>
        <div className="flex gap-1 p-1 rounded-lg bg-surface border border-border">
          {(['all', 'chart', 'candlestick', 'buy', 'sell'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors capitalize ${filter === f ? 'bg-primary text-black' : 'text-muted hover:text-text'}`}>
              {f === 'all' ? 'All' : f === 'chart' ? 'Chart' : f === 'candlestick' ? 'Candles' : f === 'buy' ? 'Bullish' : 'Bearish'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading && rows.length === 0 ? (
          <div className="col-span-full py-12 text-center text-muted text-sm flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Scanning for patterns…
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-12 text-center text-muted text-sm">No patterns detected with the current filter.</div>
        ) : (
          filtered.map((r) => (
            <div key={r.symbol} className="bg-surface border border-border rounded-xl p-4 hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold">{r.label}</div>
                  <div className="text-xs text-muted tabular-nums">${r.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  {r.bullishCount > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-success">
                      <TrendingUp className="w-3 h-3" />{r.bullishCount}
                    </span>
                  )}
                  {r.bearishCount > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-danger">
                      <TrendingDown className="w-3 h-3" />{r.bearishCount}
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                {r.patterns.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full ${p.side === 'buy' ? 'bg-success' : p.side === 'sell' ? 'bg-danger' : 'bg-muted'}`} />
                    <span className="font-medium">{p.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${p.kind === 'chart' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>
                      {p.kind}
                    </span>
                    <span className="text-muted ml-auto tabular-nums">{(p.confidence * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
