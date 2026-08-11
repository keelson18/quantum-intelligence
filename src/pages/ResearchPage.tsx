import { useState, useEffect, useCallback } from 'react';
import { Microscope, RefreshCw, Grid3x3, FileText, TrendingUp, Activity, Gauge } from 'lucide-react';
import { fetchKlines } from '../lib/binance';
import { computeIndicators, correlation } from '../lib/indicators';
import { analyzeMarketStructure } from '../lib/structure';
import { detectAllPatterns } from '../lib/patterns';
import { makeDecision } from '../lib/decision';
import { CRYPTO_INSTRUMENTS, type Candle, type Timeframe, type Regime, type Side } from '../lib/types';
import { Fragment } from 'react';

const REGIME_LABELS: Record<Regime, string> = {
  trend_up: 'Up', trend_down: 'Down', range: 'Range', consolidation: 'Consol', expansion: 'Expand',
};
const REGIME_COLORS: Record<Regime, string> = {
  trend_up: 'text-success', trend_down: 'text-danger', range: 'text-warning', consolidation: 'text-muted', expansion: 'text-primary',
};

interface AssetReport {
  symbol: string;
  label: string;
  price: number;
  change24h: number;
  trend: 'Bullish' | 'Bearish' | 'Neutral';
  momentum: 'Strong' | 'Moderate' | 'Weak';
  volatility: 'High' | 'Moderate' | 'Low';
  aiOutlook: Side;
  confidence: number;
  rsi: number;
  adx: number;
  macdHist: number;
  atr: number;
  pattern: string | null;
  regime: Regime;
  strategy: string;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
}

interface MultiTfRow {
  symbol: string;
  label: string;
  regimes: Record<Timeframe, Regime | null>;
  rsi: Record<Timeframe, number>;
  adx: Record<Timeframe, number>;
  trendStrength: number;
}

const SCAN_TFS: Timeframe[] = ['1h', '4h', '1d'];

export default function ResearchPage() {
  const [reports, setReports] = useState<AssetReport[]>([]);
  const [rows, setRows] = useState<MultiTfRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [corrMatrix, setCorrMatrix] = useState<{ symbols: string[]; data: number[][] } | null>(null);
  const [corrLoading, setCorrLoading] = useState(false);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    const symbols = CRYPTO_INSTRUMENTS.filter((i) => i.live).slice(0, 8).map((i) => i.symbol);
    const assetReports: AssetReport[] = [];
    const multiTfRows: MultiTfRow[] = [];
    const cache: Record<string, Candle[]> = {};

    for (const sym of symbols) {
      const regimes: Record<Timeframe, Regime | null> = {} as Record<Timeframe, Regime | null>;
      const rsiData: Record<Timeframe, number> = {} as Record<Timeframe, number>;
      const adxData: Record<Timeframe, number> = {} as Record<Timeframe, number>;
      let bestTrend = 0;

      try {
        const dailyCandles = await fetchKlines(sym, '1d', 300);
        if (dailyCandles.length < 60) continue;
        cache[`${sym}_1d`] = dailyCandles;

        for (const tf of SCAN_TFS) {
          try {
            const candles = tf === '1d' ? dailyCandles : await fetchKlines(sym, tf, 300);
            if (candles.length < 60) { regimes[tf] = null; continue; }
            cache[`${sym}_${tf}`] = candles;
            const structure = analyzeMarketStructure(candles);
            const ind = computeIndicators(candles);
            const lastIdx = candles.length - 1;
            regimes[tf] = structure.regime;
            rsiData[tf] = ind.rsi[lastIdx] ?? 0;
            adxData[tf] = ind.adx[lastIdx] ?? 0;
            if (structure.trendStrength > bestTrend) bestTrend = structure.trendStrength;
          } catch { regimes[tf] = null; }
        }

        const candles1h = cache[`${sym}_1h`] ?? dailyCandles;
        const decision = makeDecision(candles1h, null, sym, '1h');
        const ind = computeIndicators(candles1h);
        const lastIdx = candles1h.length - 1;
        const change24h = ((candles1h[lastIdx].close - candles1h[lastIdx - 24].close) / candles1h[lastIdx - 24].close) * 100;
        const patterns = detectAllPatterns(candles1h);
        const recentPattern = patterns.find((p) => p.index >= lastIdx - 3 && p.side !== 'neutral');
        const structure = analyzeMarketStructure(candles1h);

        const adx = ind.adx[lastIdx] ?? 0;
        const rsi = ind.rsi[lastIdx] ?? 0;
        const macdHist = ind.macd.hist[lastIdx] ?? 0;
        const atrVal = ind.atr[lastIdx] ?? 0;
        const volatilityPct = atrVal / candles1h[lastIdx].close * 100;

        const trend: 'Bullish' | 'Bearish' | 'Neutral' =
          structure.regime === 'trend_up' || (macdHist > 0 && rsi > 50) ? 'Bullish' :
          structure.regime === 'trend_down' || (macdHist < 0 && rsi < 50) ? 'Bearish' : 'Neutral';

        const momentum: 'Strong' | 'Moderate' | 'Weak' =
          adx > 30 ? 'Strong' : adx > 20 ? 'Moderate' : 'Weak';

        const volatility: 'High' | 'Moderate' | 'Low' =
          volatilityPct > 3 ? 'High' : volatilityPct > 1.5 ? 'Moderate' : 'Low';

        const aiOutlook: Side = decision?.recommendation.side ?? 'neutral';
        const confidence = decision ? Math.abs(decision.recommendation.score) : 0;

        assetReports.push({
          symbol: sym,
          label: CRYPTO_INSTRUMENTS.find((c) => c.symbol === sym)?.label ?? sym,
          price: candles1h[lastIdx].close,
          change24h,
          trend, momentum, volatility,
          aiOutlook, confidence,
          rsi, adx, macdHist, atr: atrVal,
          pattern: recentPattern?.name ?? null,
          regime: structure.regime,
          strategy: decision?.recommendation.strategyLabel ?? '—',
          stopLoss: decision?.recommendation.risk?.stopLoss ?? 0,
          takeProfit: decision?.recommendation.risk?.takeProfit ?? 0,
          riskReward: decision?.recommendation.risk?.riskReward ?? 0,
        });

        multiTfRows.push({
          symbol: sym,
          label: CRYPTO_INSTRUMENTS.find((c) => c.symbol === sym)?.label ?? sym,
          regimes, rsi: rsiData, adx: adxData, trendStrength: bestTrend,
        });
      } catch { /* skip */ }
    }

    setReports(assetReports.sort((a, b) => b.confidence - a.confidence));
    setRows(multiTfRows);
    setLoading(false);

    // Correlation matrix
    setCorrLoading(true);
    const series: Record<string, number[]> = {};
    for (const sym of symbols.slice(0, 6)) {
      const c = cache[`${sym}_1d`];
      if (c) series[sym] = c.slice(-50).map((cd) => cd.close);
    }
    const symList = Object.keys(series);
    const data: number[][] = [];
    for (let i = 0; i < symList.length; i++) {
      const row: number[] = [];
      for (let j = 0; j < symList.length; j++) {
        row.push(i === j ? 1 : correlation(series[symList[i]], series[symList[j]]));
      }
      data.push(row);
    }
    setCorrMatrix({ symbols: symList, data });
    setCorrLoading(false);
  }, []);

  useEffect(() => { runAnalysis(); }, [runAnalysis]);

  return (
    <div className="px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Microscope className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">Research Terminal</h1>
          <p className="text-xs text-muted mt-0.5">Market intelligence hub — asset reports, AI outlook, correlation matrix</p>
        </div>
        <button onClick={runAnalysis} disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 text-xs font-medium disabled:opacity-40 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Analyzing…' : 'Refresh'}
        </button>
      </div>

      {/* Asset Reports */}
      <div>
        <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-primary" /> AI Asset Reports</h3>
        {loading && reports.length === 0 ? (
          <div className="py-12 text-center text-muted text-sm flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Generating reports…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {reports.map((r) => (
              <div key={r.symbol} className="bg-surface border border-border rounded-xl p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold">{r.label}</div>
                    <div className="text-xs text-muted">${r.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} · {r.change24h >= 0 ? '+' : ''}{r.change24h.toFixed(2)}%</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${
                      r.aiOutlook === 'buy' ? 'text-success' :
                      r.aiOutlook === 'sell' ? 'text-danger' : 'text-muted'
                    }`}>
                      {r.aiOutlook === 'buy' ? 'BUY' : r.aiOutlook === 'sell' ? 'SELL' : 'HOLD'}
                    </div>
                    <div className="text-xs text-muted tabular-nums">{(r.confidence * 100).toFixed(0)}% conf</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <ReportPill label="Trend" value={r.trend} icon={<TrendingUp className="w-3 h-3" />}
                    color={r.trend === 'Bullish' ? 'text-success' : r.trend === 'Bearish' ? 'text-danger' : 'text-muted'} />
                  <ReportPill label="Momentum" value={r.momentum} icon={<Activity className="w-3 h-3" />}
                    color={r.momentum === 'Strong' ? 'text-primary' : r.momentum === 'Moderate' ? 'text-warning' : 'text-muted'} />
                  <ReportPill label="Volatility" value={r.volatility} icon={<Gauge className="w-3 h-3" />}
                    color={r.volatility === 'High' ? 'text-danger' : r.volatility === 'Moderate' ? 'text-warning' : 'text-muted'} />
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-xs">
                  <Metric label="RSI" value={r.rsi.toFixed(0)} />
                  <Metric label="ADX" value={r.adx.toFixed(0)} />
                  <Metric label="ATR" value={r.atr.toFixed(2)} />
                  <Metric label="R:R" value={r.riskReward.toFixed(2)} />
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs mt-1.5">
                  <Metric label="SL" value={`$${r.stopLoss.toFixed(2)}`} color="text-danger" />
                  <Metric label="TP" value={`$${r.takeProfit.toFixed(2)}`} color="text-success" />
                </div>
                {r.pattern && (
                  <div className="mt-2 text-xs text-primary bg-primary/5 rounded-lg px-2 py-1">Pattern: {r.pattern}</div>
                )}
                <div className="mt-1.5 text-xs text-muted">Strategy: {r.strategy} · {REGIME_LABELS[r.regime]}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Multi-timeframe table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <Grid3x3 className="w-3.5 h-3.5 text-primary" />
          <h3 className="text-xs font-semibold">Multi-Timeframe Regime Analysis</h3>
        </div>
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="text-left px-4 py-2.5 font-medium">Instrument</th>
                  {SCAN_TFS.map((tf) => (
                    <th key={tf} className="text-center px-4 py-2.5 font-medium" colSpan={3}>{tf}</th>
                  ))}
                  <th className="text-right px-4 py-2.5 font-medium">Trend Strength</th>
                </tr>
                <tr className="border-b border-border text-muted text-[10px]">
                  <th></th>
                  {SCAN_TFS.map((tf) => (
                    <Fragment key={tf}>
                      <th className="px-2 py-1 font-normal">Regime</th>
                      <th className="px-2 py-1 font-normal">RSI</th>
                      <th className="px-2 py-1 font-normal">ADX</th>
                    </Fragment>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.symbol} className="border-b border-border/50 hover:bg-bg/50 transition-colors">
                    <td className="px-4 py-2.5 font-medium">{r.label}</td>
                    {SCAN_TFS.map((tf) => {
                      const regime = r.regimes[tf];
                      return (
                        <Fragment key={tf}>
                          <td className="px-2 py-2.5 text-center">
                            {regime ? <span className={REGIME_COLORS[regime]}>{REGIME_LABELS[regime]}</span> : '—'}
                          </td>
                          <td className="px-2 py-2.5 text-center tabular-nums">{r.rsi[tf]?.toFixed(0) ?? '—'}</td>
                          <td className="px-2 py-2.5 text-center tabular-nums">{r.adx[tf]?.toFixed(0) ?? '—'}</td>
                        </Fragment>
                      );
                    })}
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <div className="w-16 h-1.5 rounded-full bg-bg overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${r.trendStrength * 100}%` }} />
                        </div>
                        <span className="tabular-nums text-muted">{(r.trendStrength * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Correlation matrix */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <h3 className="text-xs font-semibold">Correlation Matrix (50-day daily returns)</h3>
          {corrLoading && <RefreshCw className="w-3 h-3 animate-spin text-muted" />}
        </div>
        {corrMatrix ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="text-left px-4 py-2 font-medium"></th>
                  {corrMatrix.symbols.map((s) => (
                    <th key={s} className="px-3 py-2 font-medium text-center">{s.replace('USDT', '')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {corrMatrix.symbols.map((sym, i) => (
                  <tr key={sym} className="border-b border-border/50">
                    <td className="px-4 py-2 font-medium">{sym.replace('USDT', '')}</td>
                    {corrMatrix.symbols.map((_, j) => {
                      const val = corrMatrix.data[i][j];
                      const bg = i === j ? 'bg-primary/20' : val > 0.7 ? 'bg-danger/20' : val > 0.3 ? 'bg-warning/15' : val < -0.3 ? 'bg-success/15' : '';
                      return (
                        <td key={j} className={`px-3 py-2 text-center tabular-nums ${bg}`}>
                          {val.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-muted text-sm">Run analysis to see correlations.</div>
        )}
      </div>
    </div>
  );
}

function ReportPill({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-bg/50 rounded-lg p-2 border border-border/50">
      <div className="text-[10px] text-muted mb-0.5 flex items-center gap-0.5">{icon}{label}</div>
      <div className={`text-xs font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-bg/50 rounded px-2 py-1">
      <span className="text-muted text-[10px] mr-1">{label}</span>
      <span className={`tabular-nums font-medium ${color ?? ''}`}>{value}</span>
    </div>
  );
}
