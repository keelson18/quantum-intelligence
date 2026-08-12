// ============================================================================
// Intelligence persistence — Database Bible v1.1 §6
// Persists analysis runs, per-engine results, evidence, versions,
// contradictions and decisions for audit and reproducibility.
// ============================================================================

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const evidenceSchema = z.array(
  z.object({
    key: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]),
    weight: z.number().optional(),
    note: z.string().optional(),
  }),
);

const engineResultSchema = z.object({
  engine_name: z.string().max(64),
  engine_version: z.string().max(32),
  status: z.enum(["ok", "degraded", "insufficient_data", "failed"]),
  confidence: z.number(),
  evidence: evidenceSchema,
  warnings: z.array(z.string().max(500)).max(50),
  latency_ms: z.number().int().nonnegative(),
  input_context_id: z.string().max(128),
});

const persistInput = z.object({
  contextId: z.string().max(128),
  symbol: z.string().max(24),
  timeframe: z.string().max(5),
  action: z.enum(["BUY", "SELL", "HOLD", "WATCH", "NO_TRADE"]),
  confidence: z.number(),
  rawConfidence: z.number(),
  positionMultiplier: z.number(),
  dataQualityScore: z.number().int(),
  reasons: z.array(z.string().max(500)).max(50),
  engineVersions: z.record(z.string(), z.string()),
  riskViolations: z.array(z.record(z.string(), z.unknown())).max(50),
  contradictions: z.array(z.record(z.string(), z.unknown())).max(50),
  explanation: z.record(z.string(), z.unknown()).nullable(),
  engines: z.array(engineResultSchema).max(30),
  qualityIssues: z
    .array(
      z.object({
        code: z.string().max(64),
        severity: z.enum(["info", "warning", "critical"]),
        count: z.number().int(),
        detail: z.string().max(500),
      }),
    )
    .max(30),
});

type Row = Record<string, unknown>;
interface Db {
  from(table: string): { insert(rows: Row[]): Promise<{ error: { message: string } | null }> };
}

export const persistAnalysisRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => persistInput.parse(data))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const userId = context.userId;
    const runId = crypto.randomUUID();

    const { error } = await db.from("analysis_runs").insert([
      {
        id: runId,
        user_id: userId,
        context_id: data.contextId,
        symbol: data.symbol,
        timeframe: data.timeframe,
        action: data.action,
        confidence: clamp(data.confidence),
        raw_confidence: clamp(data.rawConfidence),
        position_multiplier: clamp(data.positionMultiplier),
        data_quality_score: data.dataQualityScore,
        reasons: data.reasons,
        engine_versions: data.engineVersions,
        risk_violations: data.riskViolations,
        contradictions: data.contradictions,
        explanation: data.explanation,
      },
    ]);
    if (error) {
      console.error("[intelligence] failed to persist analysis run", error.message);
      return { error: "Could not persist analysis run" as const };
    }

    if (data.engines.length > 0) {
      const { error: engErr } = await db.from("engine_results").insert(
        data.engines.map((e) => ({
          run_id: runId,
          user_id: userId,
          engine_name: e.engine_name,
          engine_version: e.engine_version,
          status: e.status,
          confidence: clamp(e.confidence),
          evidence: e.evidence,
          warnings: e.warnings,
          latency_ms: e.latency_ms,
          input_context_id: e.input_context_id,
        })),
      );
      if (engErr) console.error("[intelligence] engine results insert failed", engErr.message);
    }

    const notable = data.qualityIssues.filter((i) => i.severity !== "info");
    if (notable.length > 0) {
      const { error: dqErr } = await db.from("data_quality_events").insert(
        notable.map((i) => ({
          user_id: userId,
          symbol: data.symbol,
          timeframe: data.timeframe,
          code: i.code,
          severity: i.severity,
          occurrences: i.count,
          detail: i.detail,
          quality_score: data.dataQualityScore,
        })),
      );
      if (dqErr) console.error("[intelligence] quality events insert failed", dqErr.message);
    }

    return { runId };
  });

function clamp(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, Number(v.toFixed(4))));
}
