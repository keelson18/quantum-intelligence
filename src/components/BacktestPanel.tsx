import type { BacktestMetrics, MonteCarloResult, WalkForwardResult } from '../lib/types';
import { Activity, BarChart3, Dice5, GitBranch } from 'lucide-react';

interface Props {
  metrics: BacktestMetrics | null;
  walkForward: WalkForwardResult | null;
  monteCarlo: MonteCarloResult | null;
  loading: boolean;
  onRun: () => void;
}

// Backtesting panel: shows walk-forward, Monte Carlo, and full metrics.
export default function BacktestPanel({ metrics, walkForward, monteCarlo, loading, onRun }: Props) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" /> Backtesting
        </h3>
        <button
          onClick={onRun}
          disabled={loading}
          className="text-xs px-2.5 py-1 rounded bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-40 transition-colors"
        >
          {loading ? 'Running…' : 'Run Backtest'}
        </button>
      </div>

      {!metrics && !loading && (
        <div className="text-xs text-muted py-6 text-center">
          Run a backtest to see walk-forward validation, Monte Carlo simulation, and performance metrics.
        </div>
      )}

      {loading && (
        <div className="text-xs text-muted py-6 text-center flex items-center justify-center gap-2">
          <Activity className="w-3 h-3 animate-spin" /> Computing walk-forward + Monte Carlo…
        </div>
      )}

      {metrics && !loading && (
        <div className="space-y-4 animate-fade-in">
          {/* Core metrics grid */}
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Win Rate" value={`${(metrics.winRate * 100).toFixed(1)}%`} />
            <Metric label="Profit Factor" value={metrics.profitFactor.toFixed(2)} />
            <Metric label="Sharpe" value={metrics.sharpe.toFixed(2)} />
            <Metric label="Sortino" value={metrics.sortino.toFixed(2)} />
            <Metric label="Max DD" value={`${(metrics.maxDrawdown * 100).toFixed(1)}%`} bad />
            <Metric label="Trades" value={metrics.totalTrades.toString()} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Metric label="Avg Win" value={`$${metrics.avgWin.toFixed(0)}`} good />
            <Metric label="Avg Loss" value={`$${metrics.avgLoss.toFixed(0)}`} bad />
            <Metric label="Expectancy" value={`$${metrics.expectancy.toFixed(0)}`} good={metrics.expectancy >= 0} bad={metrics.expectancy < 0} />
            <Metric label="R:R" value={metrics.avgLoss > 0 ? (metrics.avgWin / metrics.avgLoss).toFixed(2) : '—'} />
          </div>

          {/* Walk-forward */}
          {walkForward && (
            <div className="pt-3 border-t border-border/50">
              <div className="text-xs font-medium flex items-center gap-1.5 mb-2">
                <GitBranch className="w-3 h-3 text-primary" /> Walk-Forward Validation
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="IS Win%" value={`${(walkForward.inSample.winRate * 100).toFixed(1)}%`} />
                <Metric label="OOS Win%" value={`${(walkForward.outOfSample.winRate * 100).toFixed(1)}%`} />
                <Metric
                  label="Efficiency"
                  value={`${(walkForward.efficiency * 100).toFixed(0)}%`}
                  good={walkForward.efficiency > 0.5}
                  bad={walkForward.efficiency < 0.3}
                />
              </div>
            </div>
          )}

          {/* Monte Carlo */}
          {monteCarlo && monteCarlo.simulations > 0 && (
            <div className="pt-3 border-t border-border/50">
              <div className="text-xs font-medium flex items-center gap-1.5 mb-2">
                <Dice5 className="w-3 h-3 text-primary" /> Monte Carlo ({monteCarlo.simulations.toLocaleString()} sims)
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Median Ret" value={`${(monteCarlo.medianReturn * 100).toFixed(1)}%`} good={monteCarlo.medianReturn > 0} bad={monteCarlo.medianReturn < 0} />
                <Metric label="5th pct" value={`${(monteCarlo.p5Return * 100).toFixed(1)}%`} bad />
                <Metric label="95th pct" value={`${(monteCarlo.p95Return * 100).toFixed(1)}%`} good />
                <Metric label="Median DD" value={`${(monteCarlo.medianMaxDrawdown * 100).toFixed(1)}%`} bad />
                <Metric label="Worst DD" value={`${(monteCarlo.worstMaxDrawdown * 100).toFixed(1)}%`} bad />
                <Metric label="Ruin Prob" value={`${(monteCarlo.ruinProbability * 100).toFixed(1)}%`} bad={monteCarlo.ruinProbability > 0.05} />
              </div>
            </div>
          )}

          {/* Equity curve sparkline */}
          {metrics.equityCurve.length > 2 && (
            <div className="pt-3 border-t border-border/50">
              <div className="text-xs font-medium mb-2">Equity Curve</div>
              <EquitySparkline curve={metrics.equityCurve} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  const color = good ? 'text-success' : bad ? 'text-danger' : 'text-text';
  return (
    <div className="bg-bg/50 rounded-lg p-2 border border-border/50">
      <div className="text-xs text-muted mb-0.5">{label}</div>
      <div className={`text-sm font-medium tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function EquitySparkline({ curve }: { curve: { time: number; equity: number }[] }) {
  if (curve.length < 2) return null;
  const vals = curve.map((p) => p.equity);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const w = 100, h = 30;
  const points = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={up ? '#22c55e' : '#ef4444'} strokeWidth="1" />
    </svg>
  );
}
