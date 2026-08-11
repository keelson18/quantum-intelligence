import { useState, useEffect, useCallback } from 'react';
import BacktestPanel from '../components/BacktestPanel';
import { BarChart3, Save, Check, Database } from 'lucide-react';
import { fetchKlines } from '../lib/binance';
import { runBacktest, walkForward, monteCarlo, DEFAULT_BACKTEST } from '../lib/backtest';
import { makeDecision } from '../lib/decision';
import { supabase } from '../lib/supabase';
import { CRYPTO_INSTRUMENTS, type Candle, type Timeframe, type BacktestMetrics, type MonteCarloResult, type WalkForwardResult } from '../lib/types';
import { useAuth } from '../context/AuthContext';

const SYMBOLS = CRYPTO_INSTRUMENTS.filter((i) => i.live).slice(0, 6).map((i) => i.symbol);

export default function BacktestingPage() {
  const { user } = useAuth();
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [metrics, setMetrics] = useState<BacktestMetrics | null>(null);
  const [wf, setWf] = useState<WalkForwardResult | null>(null);
  const [mc, setMc] = useState<MonteCarloResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedRuns, setSavedRuns] = useState<Array<{ id: string; symbol: string; timeframe: string; created_at: string; metrics: BacktestMetrics }>>([]);
  const [caching, setCaching] = useState(false);
  const [cached, setCached] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchKlines(symbol, timeframe, 1000);
      setCandles(data);
    } catch { setCandles([]); }
  }, [symbol, timeframe]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load saved backtest runs from DB
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('backtest_results')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (data) {
        setSavedRuns(data.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          symbol: r.symbol as string,
          timeframe: r.timeframe as string,
          created_at: r.created_at as string,
          metrics: r.metrics as BacktestMetrics,
        })));
      }
    })();
  }, [user]);

  const handleRun = () => {
    if (candles.length < 100) return;
    setLoading(true);
    setCached(false);
    setTimeout(() => {
      const signalFn = (slice: Candle[]) => {
        if (slice.length < 60) return null;
        const res = makeDecision(slice, null, symbol, timeframe);
        if (!res || res.recommendation.side === 'neutral') return null;
        return { side: res.recommendation.side, confidence: Math.abs(res.recommendation.score) };
      };
      const m = runBacktest(candles, signalFn, DEFAULT_BACKTEST);
      const w = walkForward(candles, signalFn, DEFAULT_BACKTEST);
      const c = monteCarlo(m, 1000);
      setMetrics(m); setWf(w); setMc(c); setLoading(false);
    }, 50);
  };

  const cacheRun = async () => {
    if (!user || !metrics) return;
    setCaching(true);
    await supabase.from('backtest_results').upsert({
      user_id: user.id,
      symbol,
      timeframe,
      strategy: 'ai_ensemble',
      metrics: metrics as unknown as Record<string, unknown>,
      walk_forward: wf as unknown as Record<string, unknown>,
      monte_carlo: mc as unknown as Record<string, unknown>,
      last_run: new Date().toISOString(),
    });
    setCaching(false);
    setCached(true);
    setTimeout(() => setCached(false), 2000);
    // Refresh saved runs
    const { data } = await supabase
      .from('backtest_results')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) {
      setSavedRuns(data.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        symbol: r.symbol as string,
        timeframe: r.timeframe as string,
        created_at: r.created_at as string,
        metrics: r.metrics as BacktestMetrics,
      })));
    }
  };

  const loadCachedRun = (run: typeof savedRuns[0]) => {
    setMetrics(run.metrics);
    setSymbol(run.symbol);
    setTimeframe(run.timeframe as Timeframe);
    setWf(null);
    setMc(null);
  };

  return (
    <div className="px-4 lg:px-6 py-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <BarChart3 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">Backtesting</h1>
          <p className="text-xs text-muted mt-0.5">Walk-forward analysis with Monte Carlo simulation</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)}
          className="px-2.5 py-2 rounded-lg bg-surface border border-border text-text text-sm">
          {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}
          className="px-2.5 py-2 rounded-lg bg-surface border border-border text-text text-sm">
          {['15m', '1h', '4h', '1d'].map((tf) => <option key={tf} value={tf}>{tf}</option>)}
        </select>
        {metrics && (
          <button onClick={cacheRun} disabled={caching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 text-xs font-medium disabled:opacity-40 transition-colors">
            {cached ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {cached ? 'Saved' : caching ? 'Saving…' : 'Save Run'}
          </button>
        )}
      </div>

      <div className="max-w-lg mb-4">
        <BacktestPanel metrics={metrics} walkForward={wf} monteCarlo={mc} loading={loading} onRun={handleRun} />
      </div>

      {savedRuns.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-xs font-semibold mb-3 flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-primary" /> Saved Backtest Runs
          </h3>
          <div className="space-y-1.5">
            {savedRuns.map((run) => (
              <button key={run.id} onClick={() => loadCachedRun(run)}
                className="w-full flex items-center gap-3 py-2 px-3 rounded-lg bg-bg/50 hover:bg-bg transition-colors text-xs">
                <span className="font-medium">{run.symbol}</span>
                <span className="text-muted">{run.timeframe}</span>
                <span className="text-muted ml-auto tabular-nums">
                  Win: {(run.metrics.winRate * 100).toFixed(0)}% · PF: {run.metrics.profitFactor.toFixed(2)} · Sharpe: {run.metrics.sharpe.toFixed(2)}
                </span>
                <span className="text-muted text-[10px]">{new Date(run.created_at).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
