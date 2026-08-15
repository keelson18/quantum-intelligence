import { useState, useEffect, useCallback } from 'react';
import { BrainCircuit, RefreshCw, TrendingUp, TrendingDown, Zap, Cpu, Target, Activity } from 'lucide-react';
import { fetchKlines } from '../lib/binance';
import { makeDecision } from '../lib/decision';
import { assessRisk, DEFAULT_PORTFOLIO } from '../lib/risk';
import { CRYPTO_INSTRUMENTS, type Timeframe, type Side } from '../lib/types';
import { listAiModels, listAiPredictions } from '../lib/data/models.repo';

type Tab = 'signals' | 'models' | 'predictions';

interface TradeSignal {
  symbol: string;
  label: string;
  price: number;
  side: Side;
  score: number;
  strategy: string;
  confidence: number;
  stopLoss: number;
  takeProfit: number;
  positionValue: number;
  riskReward: number;
  contributors: { source: string; side: Side; reason: string }[];
}

interface ModelRow {
  id: string;
  name: string;
  version: string;
  architecture: string;
  status: string;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  training_samples: number | null;
  epochs: number | null;
  features: string[] | null;
  created_at: string;
}

interface PredictionRow {
  id: string;
  symbol: string;
  timeframe: string;
  prediction: string;
  probability: number;
  confidence: string;
  model_version: string;
  created_at: string;
}

export default function AICenterPage() {
  const [tab, setTab] = useState<Tab>('signals');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  const runScan = useCallback(async () => {
    setLoading(true);
    const symbols = CRYPTO_INSTRUMENTS.filter((i) => i.live).map((i) => i.symbol);
    const results: TradeSignal[] = [];
    for (let i = 0; i < symbols.length; i += 4) {
      const batch = symbols.slice(i, i + 4);
      await Promise.all(batch.map(async (sym) => {
        try {
          const candles = await fetchKlines(sym, timeframe, 300);
          if (candles.length < 60) return;
          const decision = makeDecision(candles, null, sym, timeframe);
          if (!decision || decision.recommendation.side === 'neutral') return;
          const rec = decision.recommendation;
          const risk = assessRisk(candles, rec.side, Math.abs(rec.score), DEFAULT_PORTFOLIO);
          if (!risk) return;
          results.push({
            symbol: sym,
            label: CRYPTO_INSTRUMENTS.find((c) => c.symbol === sym)?.label ?? sym,
            price: risk.entry,
            side: rec.side,
            score: rec.score,
            strategy: rec.strategyLabel,
            confidence: Math.abs(rec.score),
            stopLoss: risk.stopLoss,
            takeProfit: risk.takeProfit,
            positionValue: risk.positionValue,
            riskReward: risk.riskReward,
            contributors: rec.contributors.map((c) => ({ source: c.source, side: c.side, reason: c.reason })),
          });
        } catch { /* skip */ }
      }));
    }
    setSignals(results.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)));
    setLoading(false);
  }, [timeframe]);

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    setModels(await listAiModels<ModelRow>(20));
    setModelsLoading(false);
  }, []);

  const loadPredictions = useCallback(async () => {
    setPredictions(await listAiPredictions<PredictionRow>(50));
  }, []);

  useEffect(() => { runScan(); }, [runScan]);
  useEffect(() => { if (tab === 'models') loadModels(); if (tab === 'predictions') loadPredictions(); }, [tab, loadModels, loadPredictions]);

  const buySignals = signals.filter((s) => s.side === 'buy');
  const sellSignals = signals.filter((s) => s.side === 'sell');
  const avgConfidence = signals.length > 0 ? signals.reduce((a, s) => a + s.confidence, 0) / signals.length : 0;

  return (
    <div className="px-4 lg:px-6 py-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <BrainCircuit className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">AI Trade Center</h1>
          <p className="text-xs text-muted mt-0.5">Internal deterministic decision engine — signals, models & predictions</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-surface border border-border w-fit mb-4">
        <TabButton active={tab === 'signals'} onClick={() => setTab('signals')} icon={<Zap className="w-3.5 h-3.5" />} label="Signals" />
        <TabButton active={tab === 'models'} onClick={() => setTab('models')} icon={<Cpu className="w-3.5 h-3.5" />} label="Models" />
        <TabButton active={tab === 'predictions'} onClick={() => setTab('predictions')} icon={<Target className="w-3.5 h-3.5" />} label="Predictions" />
      </div>

      {tab === 'signals' && (
        <>
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
              {loading ? 'Analyzing…' : 'Refresh Signals'}
            </button>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-4">
            <SummaryCard label="Active Signals" value={signals.length} icon={<Zap className="w-3 h-3" />} />
            <SummaryCard label="Buy Signals" value={buySignals.length} icon={<TrendingUp className="w-3 h-3 text-success" />} color="text-success" />
            <SummaryCard label="Sell Signals" value={sellSignals.length} icon={<TrendingDown className="w-3 h-3 text-danger" />} color="text-danger" />
            <SummaryCard label="Avg Confidence" value={`${(avgConfidence * 100).toFixed(0)}%`} icon={<Activity className="w-3 h-3" />} />
          </div>

          <div className="space-y-2">
            {loading && signals.length === 0 ? (
              <div className="py-12 text-center text-muted text-sm flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> Analyzing all instruments…
              </div>
            ) : signals.length === 0 ? (
              <div className="py-12 text-center text-muted text-sm">No active trade signals. Try a different timeframe.</div>
            ) : (
              signals.map((s) => (
                <div key={s.symbol} className="bg-surface border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors">
                  <button onClick={() => setExpanded(expanded === s.symbol ? null : s.symbol)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${s.side === 'buy' ? 'bg-success/15' : 'bg-danger/15'}`}>
                      {s.side === 'buy' ? <TrendingUp className="w-4 h-4 text-success" /> : <TrendingDown className="w-4 h-4 text-danger" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{s.label}</div>
                      <div className="text-xs text-muted">{s.strategy}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium tabular-nums">${s.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                      <div className="text-xs text-muted tabular-nums">R:R {s.riskReward.toFixed(2)}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-semibold tabular-nums ${s.score >= 0 ? 'text-success' : 'text-danger'}`}>{s.score.toFixed(3)}</div>
                      <div className="text-xs text-muted tabular-nums">{(s.confidence * 100).toFixed(0)}%</div>
                    </div>
                  </button>
                  {expanded === s.symbol && (
                    <div className="px-4 pb-3 border-t border-border/50 pt-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                        <MiniMetric label="Entry" value={`$${s.price.toFixed(2)}`} />
                        <MiniMetric label="Stop Loss" value={`$${s.stopLoss.toFixed(2)}`} color="text-danger" />
                        <MiniMetric label="Take Profit" value={`$${s.takeProfit.toFixed(2)}`} color="text-success" />
                        <MiniMetric label="Position Value" value={`$${s.positionValue.toFixed(0)}`} />
                      </div>
                      <div className="text-xs font-medium mb-2 flex items-center gap-1"><Zap className="w-3 h-3 text-primary" /> Contributors</div>
                      <div className="space-y-1">
                        {s.contributors.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className={`w-1.5 h-1.5 rounded-full ${c.side === 'buy' ? 'bg-success' : c.side === 'sell' ? 'bg-danger' : 'bg-muted'}`} />
                            <span className="font-medium">{c.source}</span>
                            <span className="text-muted">— {c.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {tab === 'models' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5 text-primary" /> Trained Models</h3>
            <button onClick={loadModels} disabled={modelsLoading}
              className="flex items-center gap-1 text-xs text-primary hover:underline">
              <RefreshCw className={`w-3 h-3 ${modelsLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
          {models.length === 0 ? (
            <div className="bg-surface border border-border rounded-xl py-12 text-center text-muted text-sm">
              No trained models yet. Train a model from the AI Training panel.
            </div>
          ) : (
            <div className="space-y-2">
              {models.map((m) => (
                <div key={m.id} className="bg-surface border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-semibold">{m.name}</div>
                      <div className="text-xs text-muted">{m.architecture} · v{m.version}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      m.status === 'trained' ? 'bg-success/15 text-success' :
                      m.status === 'training' ? 'bg-primary/15 text-primary' :
                      m.status === 'failed' ? 'bg-danger/15 text-danger' : 'bg-muted/15 text-muted'
                    }`}>{m.status}</span>
                  </div>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    <MiniMetric label="Accuracy" value={m.accuracy ? `${(m.accuracy * 100).toFixed(1)}%` : '—'} />
                    <MiniMetric label="Precision" value={m.precision ? `${(m.precision * 100).toFixed(1)}%` : '—'} />
                    <MiniMetric label="Recall" value={m.recall ? `${(m.recall * 100).toFixed(1)}%` : '—'} />
                    <MiniMetric label="Samples" value={m.training_samples?.toLocaleString() ?? '—'} />
                    <MiniMetric label="Epochs" value={m.epochs?.toString() ?? '—'} />
                    <MiniMetric label="Features" value={m.features ? `${m.features.length}` : '—'} />
                  </div>
                  {m.features && m.features.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.features.slice(0, 8).map((f, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-bg text-muted">{f}</span>
                      ))}
                      {m.features.length > 8 && <span className="text-[10px] text-muted">+{m.features.length - 8} more</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'predictions' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold flex items-center gap-1.5"><Target className="w-3.5 h-3.5 text-primary" /> Prediction History</h3>
            <button onClick={loadPredictions} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
          {predictions.length === 0 ? (
            <div className="bg-surface border border-border rounded-xl py-12 text-center text-muted text-sm">
              No predictions recorded yet. Predictions are generated by the ML model during inference.
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b border-border text-muted">
                      <th className="text-left px-4 py-2.5 font-medium">Symbol</th>
                      <th className="text-center px-4 py-2.5 font-medium">TF</th>
                      <th className="text-center px-4 py-2.5 font-medium">Prediction</th>
                      <th className="text-right px-4 py-2.5 font-medium">Probability</th>
                      <th className="text-center px-4 py-2.5 font-medium">Confidence</th>
                      <th className="text-left px-4 py-2.5 font-medium">Model</th>
                      <th className="text-right px-4 py-2.5 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {predictions.map((p) => (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-bg/50 transition-colors">
                        <td className="px-4 py-2 font-medium">{p.symbol}</td>
                        <td className="px-4 py-2 text-center text-muted">{p.timeframe}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            p.prediction === 'up' ? 'bg-success/15 text-success' :
                            p.prediction === 'down' ? 'bg-danger/15 text-danger' : 'bg-muted/15 text-muted'
                          }`}>{p.prediction.toUpperCase()}</span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{(p.probability * 100).toFixed(1)}%</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`text-xs ${p.confidence === 'high' ? 'text-success' : p.confidence === 'medium' ? 'text-warning' : 'text-muted'}`}>
                            {p.confidence}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-muted">{p.model_version}</td>
                        <td className="px-4 py-2 text-right text-muted tabular-nums">{new Date(p.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${active ? 'bg-primary text-black' : 'text-muted hover:text-text'}`}>
      {icon} {label}
    </button>
  );
}

function SummaryCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color?: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-3">
      <div className="text-xs text-muted mb-1 flex items-center gap-1">{icon}{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color ?? ''}`}>{value}</div>
    </div>
  );
}

function MiniMetric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-bg/50 rounded-lg p-2 border border-border/50">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-sm font-medium tabular-nums ${color ?? ''}`}>{value}</div>
    </div>
  );
}
