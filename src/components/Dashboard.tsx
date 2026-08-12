import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Wifi, WifiOff, TrendingUp, TrendingDown, Minus,
  RefreshCw, Brain, Layers, Zap, Search,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import {
  ALL_INSTRUMENTS, CRYPTO_INSTRUMENTS, TIMEFRAMES,
  type Candle, type Timeframe, type MLPrediction, type MarketClass, type Regime,
} from '../lib/types';
import { fetchKlines, subscribeKlines } from '../lib/binance';
import { makeDecision, type DecisionResult } from '../lib/decision';
import { runMasterDecision, type MasterDecision } from '../lib/engines/masterDecision';
import { recordMasterDecision } from '../lib/intelligenceClient';
import MasterDecisionPanel from './MasterDecisionPanel';
import { fetchMLPrediction, fetchCachedMLPrediction } from '../lib/mlClient';
import { runBacktest, walkForward, monteCarlo, DEFAULT_BACKTEST } from '../lib/backtest';
import type { BacktestMetrics, MonteCarloResult, WalkForwardResult } from '../lib/types';
import PriceChart from './PriceChart';
import KineticCoach from './KineticCoach';
import BacktestPanel from './BacktestPanel';
import ExplanationPanel from './ExplanationPanel';
import { InstitutionalPanel } from './InstitutionalPanel';
import AITrainingPanel from './AITrainingPanel';

type WsStatus = 'connecting' | 'open' | 'closed' | 'reconnecting';

const REGIME_LABELS: Record<Regime, string> = {
  trend_up: 'Uptrend', trend_down: 'Downtrend', range: 'Ranging',
  consolidation: 'Consolidation', expansion: 'Expansion',
};

const REGIME_COLORS: Record<Regime, string> = {
  trend_up: 'text-success', trend_down: 'text-danger',
  range: 'text-warning', consolidation: 'text-muted', expansion: 'text-primary',
};

export default function Dashboard() {
  const { theme } = useTheme();
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [marketFilter, setMarketFilter] = useState<MarketClass | 'all'>('crypto');
  const [search, setSearch] = useState('');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [ml, setMl] = useState<MLPrediction | null>(null);
  const [mlLoading, setMlLoading] = useState(false);
  const [decision, setDecision] = useState<DecisionResult | null>(null);
  const [backtestMetrics, setBacktestMetrics] = useState<BacktestMetrics | null>(null);
  const [wfResult, setWfResult] = useState<WalkForwardResult | null>(null);
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null);
  const [btLoading, setBtLoading] = useState(false);
  const candlesRef = useRef<Candle[]>([]);

  useEffect(() => { candlesRef.current = candles; }, [candles]);

  const instrument = ALL_INSTRUMENTS.find((i) => i.symbol === symbol) ?? CRYPTO_INSTRUMENTS[0];

  // Filtered instrument list for the selector.
  const filteredInstruments = useMemo(() => {
    let list = marketFilter === 'all' ? ALL_INSTRUMENTS : ALL_INSTRUMENTS.filter((i) => i.market === marketFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.label.toLowerCase().includes(q) || i.symbol.toLowerCase().includes(q));
    }
    return list;
  }, [marketFilter, search]);

  // Load candles + subscribe to live stream (only for live crypto instruments).
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setCandles([]);
    setMl(null);
    setDecision(null);
    setBacktestMetrics(null);
    setWfResult(null);
    setMcResult(null);

    if (!instrument.live) {
      setLoading(false);
      setWsStatus('closed');
      return;
    }

    (async () => {
      try {
        const data = await fetchKlines(symbol, timeframe, 1000);
        if (disposed) return;
        setCandles(data);
        setLivePrice(data.length ? data[data.length - 1].close : null);
      } catch {
        if (!disposed) setCandles([]);
      } finally {
        if (!disposed) setLoading(false);
      }
    })();

    const unsub = subscribeKlines(symbol, timeframe, (candle) => {
      setCandles((prev) => {
        const arr = [...prev];
        const last = arr[arr.length - 1];
        if (last && last.time === candle.time) arr[arr.length - 1] = candle;
        else if (!last || candle.time > last.time) { arr.push(candle); if (arr.length > 1500) arr.shift(); }
        return arr;
      });
      setLivePrice(candle.close);
    }, (status) => setWsStatus(status));

    return () => { disposed = true; unsub(); };
  }, [symbol, timeframe, instrument.live]);

  // Fetch cached ML prediction instantly, then live.
  useEffect(() => {
    let cancelled = false;
    if (!instrument.live) return;
    (async () => {
      const cached = await fetchCachedMLPrediction(symbol, timeframe);
      if (!cancelled && cached) setMl(cached);
    })();
    return () => { cancelled = true; };
  }, [symbol, timeframe, instrument.live]);

  const refreshML = async () => {
    setMlLoading(true);
    const pred = await fetchMLPrediction(symbol, timeframe);
    if (pred) setMl(pred);
    setMlLoading(false);
  };

  // Fetch higher-timeframe candles for multi-timeframe analysis.
  const [mtfCandles, setMtfCandles] = useState<Partial<Record<Timeframe, Candle[]>>>({});
  useEffect(() => {
    if (!instrument.live) return;
    let disposed = false;
    const tfs: Timeframe[] = ['1d', '4h', '1h', '15m'];
    (async () => {
      const map: Partial<Record<Timeframe, Candle[]>> = {};
      for (const tf of tfs) {
        try { map[tf] = await fetchKlines(symbol, tf, 300); } catch { /* skip */ }
      }
      if (!disposed) setMtfCandles(map);
    })();
    return () => { disposed = true; };
  }, [symbol, instrument.live]);

  // Recompute the full v1.1 pipeline whenever candles or ML change.
  useEffect(() => {
    if (candles.length < 60 || !instrument.live) { setDecision(null); setMaster(null); return; }
    const candleMap = { ...mtfCandles, [timeframe]: candles };
    const md = runMasterDecision({ candles, symbol, timeframe, ml, candleMap });
    setMaster(md);
    setDecision(md.analysis);
    void recordMasterDecision(md);
  }, [candles, ml, symbol, timeframe, instrument.live, mtfCandles]);

  const runBacktestNow = () => {
    if (candles.length < 100 || !instrument.live) return;
    setBtLoading(true);
    // Defer to next tick so UI updates.
    setTimeout(() => {
      try {
        // Use the selected strategy's signal for backtesting.
        const signalFn = (slice: Candle[]) => {
          if (slice.length < 60) return null;
          const res = makeDecision(slice, null, symbol, timeframe);
          if (!res || res.recommendation.side === 'neutral') return null;
          return { side: res.recommendation.side, confidence: Math.abs(res.recommendation.score) };
        };
        const metrics = runBacktest(candles, signalFn, DEFAULT_BACKTEST);
        const wf = walkForward(candles, signalFn, DEFAULT_BACKTEST);
        const mc = monteCarlo(metrics, 1000);
        setBacktestMetrics(metrics);
        setWfResult(wf);
        setMcResult(mc);
      } catch (e) {
        console.error('backtest error', e);
      } finally {
        setBtLoading(false);
      }
    }, 50);
  };

  const priceChange = useMemo(() => {
    if (candles.length < 2) return null;
    const first = candles[Math.max(0, candles.length - 24)].close;
    const last = candles[candles.length - 1].close;
    return ((last - first) / first) * 100;
  }, [candles]);

  const rec = decision?.recommendation;

  return (
    <div className="min-h-screen bg-bg text-text">

      <div className="px-4 lg:px-6 py-4">
        {/* Top bar with WS status */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Market Overview</h2>
          <WsIndicator status={wsStatus} live={instrument.live} />
        </div>
        {/* Instrument selector + controls */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search instruments…"
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-surface border border-border text-text placeholder:text-muted/60 focus:outline-none focus:border-primary text-sm"
              />
            </div>
            <select
              value={marketFilter}
              onChange={(e) => setMarketFilter(e.target.value as MarketClass | 'all')}
              className="px-2.5 py-2 rounded-lg bg-surface border border-border text-text focus:outline-none focus:border-primary text-sm"
            >
              <option value="all">All</option>
              <option value="crypto">Crypto</option>
              <option value="forex">Forex</option>
              <option value="commodity">Commodities</option>
              <option value="index">Indices</option>
              <option value="stock">Stocks</option>
            </select>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="px-3 py-2 rounded-lg bg-surface border border-border text-text focus:outline-none focus:border-primary text-sm max-w-[180px]"
            >
              {filteredInstruments.map((p) => (
                <option key={p.symbol} value={p.symbol}>
                  {p.label}{!p.live ? ' (no data)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-1 p-1 rounded-lg bg-surface border border-border">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  timeframe === tf.value ? 'bg-primary text-black' : 'text-muted hover:text-text'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
          {livePrice && (
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold tabular-nums">${livePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              {priceChange !== null && (
                <span className={`text-sm flex items-center gap-0.5 ${priceChange >= 0 ? 'text-success' : 'text-danger'}`}>
                  {priceChange >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {Math.abs(priceChange).toFixed(2)}%
                </span>
              )}
            </div>
          )}
        </div>

        {/* No-data state for non-live instruments */}
        {!instrument.live && (
          <div className="bg-surface border border-border rounded-xl p-8 text-center mb-4">
            <Layers className="w-8 h-8 text-muted mx-auto mb-3" />
            <h3 className="text-sm font-medium mb-1">{instrument.label}</h3>
            <p className="text-xs text-muted max-w-md mx-auto">
              This market requires a paid data provider (e.g. OANDA, Polygon.io, Alpha Vantage) to stream live prices.
              It's included in the platform's instrument universe and architecture. Connect a data provider to enable
              live analysis for forex, commodities, indices, and stocks.
            </p>
          </div>
        )}

        {/* Main content — only for live instruments */}
        {instrument.live && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: chart + recommendation + explanation */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-surface border border-border rounded-xl overflow-hidden h-[440px] relative">
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center text-muted text-sm z-10">
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading market data…
                  </div>
                )}
                {!loading && candles.length > 0 && (
                  <PriceChart candles={candles} overlays={decision?.overlays ?? []} theme={theme} />
                )}
              </div>

              {/* Regime + strategy bar */}
              {decision && (
                <div className="flex flex-wrap items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted">Regime:</span>
                    <span className={`text-sm font-medium ${REGIME_COLORS[decision.regime]}`}>{REGIME_LABELS[decision.regime]}</span>
                  </div>
                  <div className="w-px h-4 bg-border" />
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted">Strategy:</span>
                    <span className="text-sm font-medium">{rec?.strategyLabel}</span>
                  </div>
                  {rec && (
                    <>
                      <div className="w-px h-4 bg-border" />
                      <SideBadge side={rec.side} />
                      <span className="text-xs text-muted tabular-nums ml-auto">Score: {rec.score.toFixed(3)}</span>
                    </>
                  )}
                </div>
              )}

              {/* Recommendation with risk + contributors */}
              {rec && <RecommendationCard rec={rec} />}

              {/* Explainable AI */}
              <ExplanationPanel explanation={rec?.explanation ?? null} />
              <InstitutionalPanel analysis={decision?.institutional ?? null} />

              {/* Backtesting */}
              <BacktestPanel
                metrics={backtestMetrics}
                walkForward={wfResult}
                monteCarlo={mcResult}
                loading={btLoading}
                onRun={runBacktestNow}
              />
            </div>

            {/* Right column: ML + patterns + signals + SMC */}
            <div className="space-y-4">
              <MLCard ml={ml} loading={mlLoading} onRefresh={refreshML} />
              {decision && <PatternsCard patterns={decision.patterns} />}
              {decision && <SignalsCard signals={decision.allSignals} />}
              {decision && <StructureCard decision={decision} />}
            </div>
          </div>
        )}

        {/* In-browser AI engine — full width, only for live instruments */}
        {instrument.live && (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AITrainingPanel symbol={symbol} timeframe={timeframe} candles={candles} />
            <div className="bg-surface border border-border rounded-xl h-[380px] overflow-hidden">
              <KineticCoach />
            </div>
          </div>
        )}

        {/* Coach standalone for non-live instruments */}
        {!instrument.live && (
          <div className="mt-4 bg-surface border border-border rounded-xl h-[380px] overflow-hidden">
            <KineticCoach />
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Sub-components ----

function WsIndicator({ status, live }: { status: WsStatus; live: boolean }) {
  if (!live) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted" title="No live data feed">
        <WifiOff className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">No Feed</span>
      </div>
    );
  }
  const map: Record<WsStatus, { color: string; icon: typeof Wifi; label: string }> = {
    open: { color: 'text-success', icon: Wifi, label: 'Live' },
    connecting: { color: 'text-warning', icon: Wifi, label: 'Connecting' },
    reconnecting: { color: 'text-warning', icon: WifiOff, label: 'Reconnecting' },
    closed: { color: 'text-danger', icon: WifiOff, label: 'Off' },
  };
  const { color, icon: Icon, label } = map[status];
  return (
    <div className={`flex items-center gap-1.5 text-xs ${color}`}>
      <Icon className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

function SideBadge({ side }: { side: string }) {
  const cfg = side === 'buy'
    ? { color: 'bg-success/15 text-success', icon: TrendingUp, label: 'BUY' }
    : side === 'sell'
    ? { color: 'bg-danger/15 text-danger', icon: TrendingDown, label: 'SELL' }
    : { color: 'bg-muted/15 text-muted', icon: Minus, label: 'NEUTRAL' };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${cfg.color}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

function RecommendationCard({ rec }: { rec: import('../lib/types').Recommendation }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" /> Combined Recommendation
        </h3>
        <SideBadge side={rec.side} />
      </div>

      {/* Score bar */}
      <div className="mb-4">
        <div className="text-xs text-muted mb-1">Signal Score</div>
        <div className="h-2 bg-border rounded-full overflow-hidden relative">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
          <div
            className={`h-full transition-all ${rec.score >= 0 ? 'bg-success' : 'bg-danger'}`}
            style={{
              width: `${Math.abs(rec.score) * 50}%`,
              marginLeft: rec.score >= 0 ? '50%' : `${50 - Math.abs(rec.score) * 50}%`,
            }}
          />
        </div>
        <div className="text-xs text-muted mt-1 tabular-nums">{rec.score.toFixed(3)} (−1 bearish · +1 bullish)</div>
      </div>

      {/* Risk levels */}
      {rec.risk && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <RiskBox label="Entry" value={rec.risk.entry} color="text-text" />
            <RiskBox label="Stop Loss" value={rec.risk.stopLoss} color="text-danger" />
            <RiskBox label="Take Profit" value={rec.risk.takeProfit} color="text-success" />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
            <div className="bg-bg/50 rounded-lg p-2 border border-border/50">
              <div className="text-muted mb-0.5">Position Size</div>
              <div className="font-medium tabular-nums">{rec.risk.positionSize.toFixed(4)}</div>
            </div>
            <div className="bg-bg/50 rounded-lg p-2 border border-border/50">
              <div className="text-muted mb-0.5">Risk/Trade</div>
              <div className="font-medium tabular-nums">${rec.risk.riskPerTrade.toFixed(0)}</div>
            </div>
            <div className="bg-bg/50 rounded-lg p-2 border border-border/50">
              <div className="text-muted mb-0.5">R:R</div>
              <div className="font-medium tabular-nums">{rec.risk.riskReward.toFixed(1)}:1</div>
            </div>
          </div>
          {rec.risk.correlationWarning && (
            <div className="text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-1.5 mb-3">
              {rec.risk.correlationWarning}
            </div>
          )}
          <div className="text-xs text-muted mb-3">
            Kelly: {(rec.risk.kellyFraction * 100).toFixed(1)}% · ATR: {rec.risk.atr.toFixed(2)} · Exposure: {(rec.risk.portfolioExposure * 100).toFixed(1)}%
          </div>
        </>
      )}

      {/* Contributors */}
      <div className="space-y-1">
        <div className="text-xs text-muted mb-1.5">Contributing Signals</div>
        {rec.contributors.map((c, i) => (
          <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-bg/50">
            <div className="flex items-center gap-2 min-w-0">
              <SideBadge side={c.side} />
              <span className="truncate text-muted">{c.source}</span>
            </div>
            <span className="text-muted tabular-nums shrink-0">{(c.confidence * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-bg/50 rounded-lg p-2.5 border border-border/50">
      <div className={`text-xs ${color} mb-1`}>{label}</div>
      <div className="text-sm font-medium tabular-nums">{value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
    </div>
  );
}

function MLCard({ ml, loading, onRefresh }: { ml: MLPrediction | null; loading: boolean; onRefresh: () => void }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" /> ML Prediction
        </h3>
        <button onClick={onRefresh} disabled={loading} className="p-1.5 rounded hover:bg-bg transition-colors disabled:opacity-40">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {!ml && !loading && <div className="text-xs text-muted">Click refresh to run the ensemble model.</div>}
      {loading && <div className="text-xs text-muted flex items-center gap-2"><RefreshCw className="w-3 h-3 animate-spin" /> Running ensemble…</div>}
      {ml && (
        <div className="space-y-2 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Direction</span>
            <SideBadge side={ml.prediction === 'up' ? 'buy' : ml.prediction === 'down' ? 'sell' : 'neutral'} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Probability</span>
            <span className="text-sm font-medium tabular-nums">{(ml.probability * 100).toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Expected Move</span>
            <span className="text-sm font-medium tabular-nums">{ml.expected_move_pct >= 0 ? '+' : ''}{ml.expected_move_pct.toFixed(2)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Confidence</span>
            <span className="text-sm font-medium capitalize">{ml.confidence}</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <span className="text-xs text-muted">Model</span>
            <span className="text-xs text-muted tabular-nums">v{ml.model_version}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PatternsCard({ patterns }: { patterns: import('../lib/types').PatternHit[] }) {
  const candle = patterns.filter((p) => p.kind === 'candlestick');
  const chart = patterns.filter((p) => p.kind === 'chart');
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-3">Pattern Recognition</h3>
      {patterns.length === 0 && <div className="text-xs text-muted">No patterns detected.</div>}
      {chart.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-muted mb-1.5">Chart Patterns</div>
          {chart.map((p, i) => (
            <div key={i} className="flex items-center gap-2 py-1 text-xs">
              <SideBadge side={p.side} />
              <span className="font-medium">{p.name}</span>
              <span className="text-muted ml-auto tabular-nums">{(p.confidence * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
      {candle.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-1.5">Candlestick Patterns</div>
          {candle.map((p, i) => (
            <div key={i} className="flex items-center gap-2 py-1 text-xs">
              <SideBadge side={p.side} />
              <span className="font-medium">{p.name}</span>
              <span className="text-muted ml-auto tabular-nums">{(p.confidence * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SignalsCard({ signals }: { signals: import('../lib/types').Signal[] }) {
  const active = signals.filter((s) => s.side !== 'neutral');
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-3">Strategy Library</h3>
      <div className="space-y-1">
        {signals.map((s, i) => (
          <div key={i} className={`flex items-center gap-2 py-1.5 text-xs ${s.side === 'neutral' ? 'opacity-50' : ''}`}>
            <SideBadge side={s.side} />
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{s.strategy}</div>
              <div className="text-muted truncate">{s.reason}</div>
            </div>
            <span className="text-muted tabular-nums shrink-0">{(s.confidence * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
      {active.length === 0 && <div className="text-xs text-muted mt-2">All strategies neutral.</div>}
    </div>
  );
}

function StructureCard({ decision }: { decision: DecisionResult }) {
  const events = decision.selectedStrategy;
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Layers className="w-4 h-4 text-primary" /> Market Structure
      </h3>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted">Regime</span>
          <span className={`font-medium ${REGIME_COLORS[decision.regime]}`}>{REGIME_LABELS[decision.regime]}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Selected Strategy</span>
          <span className="font-medium">{events.label}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Selection Reason</span>
          <span className="text-right text-muted ml-2">{events.reason}</span>
        </div>
      </div>
    </div>
  );
}
