import { useState, useEffect, useCallback } from 'react';
import { Radar, RefreshCw, TrendingUp, TrendingDown, Minus, Filter } from 'lucide-react';
import { fetchKlines } from '../lib/binance';
import { makeDecision } from '../lib/decision';
import { computeIndicators } from '../lib/indicators';
import { detectAllPatterns } from '../lib/patterns';
import { CRYPTO_INSTRUMENTS, type Timeframe, type Side, type Regime } from '../lib/types';

interface ScanRow {
  symbol: string;
  label: string;
  price: number;
  change24h: number;
  side: Side;
  score: number;
  aiScore: number;
  strategy: string;
  regime: Regime;
  confidence: number;
  rsi: number;
  adx: number;
  macdHist: number;
  emaCross: 'bullish' | 'bearish' | 'none';
  volume24h: number;
  volumeSpike: boolean;
  volatility: number;
  pattern: string | null;
}

const REGIME_LABELS: Record<Regime, string> = {
  trend_up: 'Uptrend', trend_down: 'Downtrend', range: 'Ranging',
  consolidation: 'Consolidation', expansion: 'Expansion',
};

export default function ScannerPage() {
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sideFilter, setSideFilter] = useState<Side | 'all'>('all');
  const [regimeFilter, setRegimeFilter] = useState<Regime | 'all'>('all');
  const [sortBy, setSortBy] = useState<'aiScore' | 'score' | 'change' | 'confidence' | 'volume' | 'volatility'>('aiScore');

  // Advanced numeric range filters
  const [rsiMin, setRsiMin] = useState('');
  const [rsiMax, setRsiMax] = useState('');
  const [volMin, setVolMin] = useState('');
  const [patternFilter, setPatternFilter] = useState('all');
  const [emaFilter, setEmaFilter] = useState('all');
  const [aiConfMin, setAiConfMin] = useState('');

  const runScan = useCallback(async () => {
    setLoading(true);
    const symbols = CRYPTO_INSTRUMENTS.filter((i) => i.live).map((i) => i.symbol);
    const results: ScanRow[] = [];
    for (let i = 0; i < symbols.length; i += 4) {
      const batch = symbols.slice(i, i + 4);
      await Promise.all(batch.map(async (sym) => {
        try {
          const candles = await fetchKlines(sym, timeframe, 300);
          if (candles.length < 60) return;
          const decision = makeDecision(candles, null, sym, timeframe);
          if (!decision) return;
          const ind = computeIndicators(candles);
          const lastIdx = candles.length - 1;
          const change = ((candles[lastIdx].close - candles[lastIdx - 24].close) / candles[lastIdx - 24].close) * 100;
          const volume24h = candles.slice(-24).reduce((a, c) => a + c.volume, 0);
          const avgVol = candles.slice(-50, -24).reduce((a, c) => a + c.volume, 0) / 26;
          const volumeSpike = avgVol > 0 && candles[lastIdx].volume > avgVol * 1.5;
          const volatility = ind.atr[lastIdx] / candles[lastIdx].close * 100;
          const patterns = detectAllPatterns(candles);
          const recentPattern = patterns.find((p) => p.index >= lastIdx - 3 && p.side !== 'neutral');
          const ema20 = ind.ema[20][lastIdx] ?? 0;
          const ema50 = ind.ema[50][lastIdx] ?? 0;
          const ema20Prev = ind.ema[20][lastIdx - 1] ?? 0;
          const ema50Prev = ind.ema[50][lastIdx - 1] ?? 0;
          const emaCross: 'bullish' | 'bearish' | 'none' =
            ema20Prev <= ema50Prev && ema20 > ema50 ? 'bullish' :
            ema20Prev >= ema50Prev && ema20 < ema50 ? 'bearish' : 'none';

          const confidence = Math.abs(decision.recommendation.score);
          const aiScore = Math.round(
            confidence * 40 +
            Math.min(change, 10) * 2 +
            (volumeSpike ? 8 : 0) +
            (recentPattern ? 8 : 0) +
            (decision.recommendation.side !== 'neutral' ? 6 : 0) +
            (ind.adx[lastIdx] > 25 ? 6 : 0)
          );

          results.push({
            symbol: sym,
            label: CRYPTO_INSTRUMENTS.find((c) => c.symbol === sym)?.label ?? sym,
            price: candles[lastIdx].close,
            change24h: change,
            side: decision.recommendation.side,
            score: decision.recommendation.score,
            aiScore,
            strategy: decision.recommendation.strategyLabel,
            regime: decision.regime,
            confidence,
            rsi: ind.rsi[lastIdx] ?? 0,
            adx: ind.adx[lastIdx] ?? 0,
            macdHist: ind.macd.hist[lastIdx] ?? 0,
            emaCross,
            volume24h,
            volumeSpike,
            volatility,
            pattern: recentPattern?.name ?? null,
          });
        } catch { /* skip failed symbols */ }
      }));
    }
    setRows(results);
    setLoading(false);
  }, [timeframe]);

  useEffect(() => { runScan(); }, [runScan]);

  const filtered = rows
    .filter((r) => sideFilter === 'all' || r.side === sideFilter)
    .filter((r) => regimeFilter === 'all' || r.regime === regimeFilter)
    .filter((r) => {
      if (!rsiMin && !rsiMax) return true;
      const min = rsiMin ? parseFloat(rsiMin) : 0;
      const max = rsiMax ? parseFloat(rsiMax) : 100;
      return r.rsi >= min && r.rsi <= max;
    })
    .filter((r) => {
      if (!volMin) return true;
      return r.volume24h >= parseFloat(volMin);
    })
    .filter((r) => {
      if (patternFilter === 'all') return true;
      if (patternFilter === 'yes') return r.pattern !== null;
      if (patternFilter === 'no') return r.pattern === null;
      return r.pattern?.toLowerCase().includes(patternFilter.toLowerCase());
    })
    .filter((r) => {
      if (emaFilter === 'all') return true;
      if (emaFilter === 'bullish') return r.emaCross === 'bullish';
      if (emaFilter === 'bearish') return r.emaCross === 'bearish';
      return true;
    })
    .filter((r) => {
      if (!aiConfMin) return true;
      return r.confidence * 100 >= parseFloat(aiConfMin);
    })
    .sort((a, b) => {
      if (sortBy === 'aiScore') return b.aiScore - a.aiScore;
      if (sortBy === 'score') return Math.abs(b.score) - Math.abs(a.score);
      if (sortBy === 'change') return Math.abs(b.change24h) - Math.abs(a.change24h);
      if (sortBy === 'volume') return b.volume24h - a.volume24h;
      if (sortBy === 'volatility') return b.volatility - a.volatility;
      return b.confidence - a.confidence;
    });

  return (
    <div className="px-4 lg:px-6 py-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Radar className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">Market Scanner</h1>
          <p className="text-xs text-muted mt-0.5">Multi-factor scan with AI Score ranking across {CRYPTO_INSTRUMENTS.filter(i => i.live).length} instruments</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
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
      </div>

      {/* Advanced filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
        <Filter className="w-3.5 h-3.5 text-muted" />
        <select value={sideFilter} onChange={(e) => setSideFilter(e.target.value as Side | 'all')}
          className="px-2 py-1.5 rounded-lg bg-surface border border-border text-text text-xs">
          <option value="all">All Signals</option>
          <option value="buy">Buy Only</option>
          <option value="sell">Sell Only</option>
          <option value="neutral">Neutral</option>
        </select>
        <select value={regimeFilter} onChange={(e) => setRegimeFilter(e.target.value as Regime | 'all')}
          className="px-2 py-1.5 rounded-lg bg-surface border border-border text-text text-xs">
          <option value="all">All Regimes</option>
          <option value="trend_up">Uptrend</option>
          <option value="trend_down">Downtrend</option>
          <option value="range">Ranging</option>
          <option value="consolidation">Consolidation</option>
          <option value="expansion">Expansion</option>
        </select>
        <select value={emaFilter} onChange={(e) => setEmaFilter(e.target.value)}
          className="px-2 py-1.5 rounded-lg bg-surface border border-border text-text text-xs">
          <option value="all">EMA: Any</option>
          <option value="bullish">EMA: Bullish Cross</option>
          <option value="bearish">EMA: Bearish Cross</option>
        </select>
        <select value={patternFilter} onChange={(e) => setPatternFilter(e.target.value)}
          className="px-2 py-1.5 rounded-lg bg-surface border border-border text-text text-xs">
          <option value="all">Patterns: All</option>
          <option value="yes">Has Pattern</option>
          <option value="no">No Pattern</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-2 py-1.5 rounded-lg bg-surface border border-border text-text text-xs">
          <option value="aiScore">Sort: AI Score</option>
          <option value="score">Sort: Signal Score</option>
          <option value="change">Sort: 24h Change</option>
          <option value="confidence">Sort: Confidence</option>
          <option value="volume">Sort: Volume</option>
          <option value="volatility">Sort: Volatility</option>
        </select>
        <div className="flex items-center gap-1">
          <span className="text-muted">RSI:</span>
          <input value={rsiMin} onChange={(e) => setRsiMin(e.target.value)} placeholder="min" className="w-12 px-1.5 py-1 rounded bg-surface border border-border text-text text-xs tabular-nums" />
          <span className="text-muted">-</span>
          <input value={rsiMax} onChange={(e) => setRsiMax(e.target.value)} placeholder="max" className="w-12 px-1.5 py-1 rounded bg-surface border border-border text-text text-xs tabular-nums" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted">Vol ≥:</span>
          <input value={volMin} onChange={(e) => setVolMin(e.target.value)} placeholder="0" className="w-16 px-1.5 py-1 rounded bg-surface border border-border text-text text-xs tabular-nums" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted">AI Conf ≥:</span>
          <input value={aiConfMin} onChange={(e) => setAiConfMin(e.target.value)} placeholder="%" className="w-12 px-1.5 py-1 rounded bg-surface border border-border text-text text-xs tabular-nums" />
        </div>
      </div>

      {/* Results table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="py-12 text-center text-muted text-sm flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Scanning markets…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted text-sm">No instruments match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="text-left px-4 py-2.5 font-medium">Instrument</th>
                  <th className="text-right px-4 py-2.5 font-medium">Price</th>
                  <th className="text-right px-4 py-2.5 font-medium">24h %</th>
                  <th className="text-center px-4 py-2.5 font-medium">Signal</th>
                  <th className="text-right px-4 py-2.5 font-medium">AI Score</th>
                  <th className="text-right px-4 py-2.5 font-medium">Score</th>
                  <th className="text-left px-4 py-2.5 font-medium">Strategy</th>
                  <th className="text-left px-4 py-2.5 font-medium">Regime</th>
                  <th className="text-right px-4 py-2.5 font-medium">RSI</th>
                  <th className="text-right px-4 py-2.5 font-medium">ADX</th>
                  <th className="text-right px-4 py-2.5 font-medium">MACD</th>
                  <th className="text-center px-4 py-2.5 font-medium">EMA</th>
                  <th className="text-right px-4 py-2.5 font-medium">Volatility</th>
                  <th className="text-left px-4 py-2.5 font-medium">Pattern</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => (
                  <tr key={r.symbol} className="border-b border-border/50 hover:bg-bg/50 transition-colors">
                    <td className="px-4 py-2.5 font-medium">
                      <span className="flex items-center gap-1.5">
                        {idx < 3 && <span className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${idx === 0 ? 'bg-primary text-black' : idx === 1 ? 'bg-primary/60 text-black' : 'bg-primary/30 text-primary'}`}>{idx + 1}</span>}
                        {r.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">${r.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.change24h >= 0 ? 'text-success' : 'text-danger'}`}>
                      {r.change24h >= 0 ? '+' : ''}{r.change24h.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-medium ${
                        r.side === 'buy' ? 'bg-success/15 text-success' :
                        r.side === 'sell' ? 'bg-danger/15 text-danger' :
                        'bg-muted/15 text-muted'
                      }`}>
                        {r.side === 'buy' ? <TrendingUp className="w-3 h-3" /> :
                         r.side === 'sell' ? <TrendingDown className="w-3 h-3" /> :
                         <Minus className="w-3 h-3" />}
                        {r.side === 'buy' ? 'Buy' : r.side === 'sell' ? 'Sell' : 'Neutral'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span className={`font-bold ${r.aiScore >= 80 ? 'text-success' : r.aiScore >= 60 ? 'text-primary' : r.aiScore >= 40 ? 'text-warning' : 'text-muted'}`}>
                        {r.aiScore}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{r.score.toFixed(3)}</td>
                    <td className="px-4 py-2.5 text-muted">{r.strategy}</td>
                    <td className="px-4 py-2.5 text-muted">{REGIME_LABELS[r.regime]}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.rsi > 70 ? 'text-danger' : r.rsi < 30 ? 'text-success' : ''}`}>{r.rsi.toFixed(0)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.adx > 25 ? 'text-primary' : 'text-muted'}`}>{r.adx.toFixed(0)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.macdHist > 0 ? 'text-success' : 'text-danger'}`}>{r.macdHist.toFixed(4)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {r.emaCross !== 'none' ? (
                        <span className={`text-[10px] font-medium ${r.emaCross === 'bullish' ? 'text-success' : 'text-danger'}`}>
                          {r.emaCross === 'bullish' ? '↑' : '↓'}
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">{r.volatility.toFixed(2)}%</td>
                    <td className="px-4 py-2.5 text-muted">{r.pattern ?? '—'}</td>
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
