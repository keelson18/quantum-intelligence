// ============================================================================
// Engine Contract — GreenHill AI Engine Specification v1.1 §2
// Every intelligence engine returns a predictable, versioned, evidence-carrying
// result. No engine may fabricate output: missing evidence => degraded status.
// ============================================================================

export type EngineStatus = 'ok' | 'degraded' | 'insufficient_data' | 'failed';

export interface Evidence {
  key: string;
  value: string | number | boolean;
  weight?: number;
  note?: string;
}

export interface EngineResult<T> {
  engine_name: string;
  engine_version: string;
  timestamp: string;
  status: EngineStatus;
  result: T | null;
  confidence: number; // 0..1
  evidence: Evidence[];
  warnings: string[];
  latency_ms: number;
  input_context_id: string;
}

export interface EngineContext {
  /** Stable id of the analysed context snapshot (symbol + timeframe + last bar). */
  contextId: string;
}

/** Deterministic context id so a decision can be reproduced from its inputs. */
export function makeContextId(symbol: string, timeframe: string, lastBarTime: number): string {
  return `${symbol}:${timeframe}:${lastBarTime}`;
}

/**
 * Wraps a pure engine body with timing, status capture, and failure containment.
 * A throwing engine degrades to `failed` instead of breaking the pipeline.
 */
export function runEngine<T>(
  name: string,
  version: string,
  contextId: string,
  body: () => {
    status: EngineStatus;
    result: T | null;
    confidence: number;
    evidence?: Evidence[];
    warnings?: string[];
  },
): EngineResult<T> {
  const started = Date.now();
  try {
    const out = body();
    return {
      engine_name: name,
      engine_version: version,
      timestamp: new Date(started).toISOString(),
      status: out.status,
      result: out.result,
      confidence: clamp01(out.confidence),
      evidence: out.evidence ?? [],
      warnings: out.warnings ?? [],
      latency_ms: Date.now() - started,
      input_context_id: contextId,
    };
  } catch (err) {
    return {
      engine_name: name,
      engine_version: version,
      timestamp: new Date(started).toISOString(),
      status: 'failed',
      result: null,
      confidence: 0,
      evidence: [],
      warnings: [err instanceof Error ? err.message : 'Unknown engine failure'],
      latency_ms: Date.now() - started,
      input_context_id: contextId,
    };
  }
}

export function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}
