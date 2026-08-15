import { ShieldCheck, ShieldAlert, AlertTriangle, Activity, Ban, Eye, TrendingUp, TrendingDown, Pause } from 'lucide-react';
import type { MasterDecision, DecisionAction } from '../lib/engines/masterDecision';
import type { EngineStatus } from '../lib/engines/contract';
import { LAYER_LABEL, type EngineLayer } from '../lib/engines/registry';

const STATUS_DOT: Record<EngineStatus, string> = {
  ok: 'bg-success',
  degraded: 'bg-warning',
  insufficient_data: 'bg-muted',
  failed: 'bg-danger',
};

const STATUS_TEXT: Record<EngineStatus, string> = {
  ok: 'text-success',
  degraded: 'text-warning',
  insufficient_data: 'text-muted',
  failed: 'text-danger',
};

const ACTION_STYLE: Record<DecisionAction, { cls: string; label: string; Icon: typeof TrendingUp }> = {
  BUY: { cls: 'text-success border-success/40 bg-success/10', label: 'BUY', Icon: TrendingUp },
  SELL: { cls: 'text-danger border-danger/40 bg-danger/10', label: 'SELL', Icon: TrendingDown },
  HOLD: { cls: 'text-muted border-border bg-surface', label: 'HOLD', Icon: Pause },
  WATCH: { cls: 'text-warning border-warning/40 bg-warning/10', label: 'WATCH', Icon: Eye },
  NO_TRADE: { cls: 'text-danger border-danger/40 bg-danger/10', label: 'NO TRADE', Icon: Ban },
};

type PipelineRun = MasterDecision['pipeline'][number];

/** Groups consecutive pipeline steps by architecture layer, preserving spec order. */
function groupByLayer(pipeline: PipelineRun[]): { layer: EngineLayer; runs: PipelineRun[] }[] {
  const groups: { layer: EngineLayer; runs: PipelineRun[] }[] = [];
  for (const run of pipeline) {
    const last = groups[groups.length - 1];
    if (last && last.layer === run.descriptor.layer) last.runs.push(run);
    else groups.push({ layer: run.descriptor.layer, runs: [run] });
  }
  return groups;
}

export default function MasterDecisionPanel({ decision }: { decision: MasterDecision | null }) {
  if (!decision) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold mb-1">Master Decision</h3>
        <p className="text-xs text-muted">Waiting for canonical market data…</p>
      </div>
    );
  }

  const style = ACTION_STYLE[decision.action];
  const quality = decision.engines.dataQuality.result;
  const gate = decision.engines.riskGate?.result ?? null;
  const contradictions = decision.engines.contradictions?.result?.contradictions ?? [];
  const totalLatency = decision.pipeline.reduce((sum, run) => sum + run.result.latency_ms, 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Master Decision</h3>
          <p className="text-[11px] text-muted font-mono mt-0.5">{decision.contextId}</p>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${style.cls}`}>
          <style.Icon className="w-3.5 h-3.5" />
          {style.label}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric label="Confidence" value={`${(decision.confidence * 100).toFixed(0)}%`} />
        <Metric label="Raw" value={`${(decision.rawConfidence * 100).toFixed(0)}%`} />
        <Metric label="Size mult." value={`${decision.positionMultiplier.toFixed(2)}×`} />
      </div>

      {/* Data quality */}
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-primary" /> Data Quality
          </span>
          <span className={`text-xs font-semibold ${(quality?.score ?? 0) >= 80 ? 'text-success' : (quality?.score ?? 0) >= 50 ? 'text-warning' : 'text-danger'}`}>
            {quality?.score ?? 0}/100
          </span>
        </div>
        {quality && quality.issues.length === 0 ? (
          <p className="text-[11px] text-muted">No anomalies detected · {quality.bars} bars · {quality.fresh ? 'fresh feed' : 'stale feed'}</p>
        ) : (
          <ul className="space-y-1">
            {(quality?.issues ?? []).slice(0, 5).map((i) => (
              <li key={i.code} className="text-[11px] text-muted flex items-start gap-1.5">
                <AlertTriangle className={`w-3 h-3 mt-0.5 shrink-0 ${i.severity === 'critical' ? 'text-danger' : 'text-warning'}`} />
                {i.detail}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Risk gate */}
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          {gate?.approved
            ? <ShieldCheck className="w-3.5 h-3.5 text-success" />
            : <ShieldAlert className="w-3.5 h-3.5 text-danger" />}
          <span className="text-xs font-medium">Risk Gate — {gate?.approved ? 'Approved' : 'Not approved'}</span>
        </div>
        <p className="text-[11px] text-muted">{gate?.reason ?? 'Risk gate did not run: pipeline halted earlier.'}</p>
      </div>

      {/* Contradictions */}
      <div className="rounded-lg border border-border p-3">
        <span className="text-xs font-medium">Contradiction Analysis</span>
        {contradictions.length === 0 ? (
          <p className="text-[11px] text-muted mt-1">No contradicting evidence found.</p>
        ) : (
          <ul className="space-y-1 mt-1.5">
            {contradictions.map((c) => (
              <li key={c.code} className="text-[11px] text-muted flex items-start gap-1.5">
                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${c.severity === 'high' ? 'bg-danger' : c.severity === 'medium' ? 'bg-warning' : 'bg-muted'}`} />
                {c.detail}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Full 19-engine pipeline breakdown, spec execution order */}
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-medium">Engine Pipeline — 19 engines</span>
          <span className="text-[10px] text-muted font-mono">
            {decision.pipeline.length} steps · {totalLatency}ms
          </span>
        </div>
        <ol className="space-y-2">
          {groupByLayer(decision.pipeline).map((group) => (
            <li key={group.layer}>
              <p className="text-[9px] uppercase tracking-[0.12em] text-muted mb-1">{LAYER_LABEL[group.layer]}</p>
              <div className="space-y-1">
                {group.runs.map((run, idx) => (
                  <div
                    key={`${run.descriptor.id}-${idx}`}
                    className={`flex items-start gap-2 rounded-md border border-border/60 bg-bg/40 px-2 py-1.5 transition-colors hover:border-border ${run.skipped ? 'opacity-55' : ''}`}
                  >
                    <span className="text-[10px] font-mono text-muted w-5 shrink-0 mt-0.5 text-right tabular-nums">
                      {run.descriptor.order}
                    </span>
                    <span
                      className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[run.result.status]}`}
                      title={run.result.status}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-[11px] font-medium leading-tight">{run.descriptor.label}</span>
                        <span className="text-[9px] font-mono text-muted">v{run.result.engine_version}</span>
                      </div>
                      <p className="text-[10px] text-muted mt-0.5 break-words leading-snug">{run.verdict}</p>
                    </div>
                    <div className="text-right shrink-0 leading-tight">
                      <p className={`text-[11px] font-semibold tabular-nums ${STATUS_TEXT[run.result.status]}`}>
                        {(run.result.confidence * 100).toFixed(0)}%
                      </p>
                      <p className="text-[9px] text-muted font-mono tabular-nums">{run.result.latency_ms}ms</p>
                    </div>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Object.entries(decision.engineVersions).map(([name, version]) => (
          <span key={name} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg border border-border text-muted">
            {name}@{version}
          </span>
        ))}
      </div>
      <p className="text-[10px] text-muted">Paper trading only — the risk gate is authoritative and cannot be bypassed.</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-2">
      <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}

