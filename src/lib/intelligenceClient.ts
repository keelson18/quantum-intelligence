import type { MasterDecision } from './engines/masterDecision';
import { persistAnalysisRun } from './intelligence.functions';

const persisted = new Set<string>();

/** Persist a decision once per context snapshot; failures never break the UI. */
export async function recordMasterDecision(md: MasterDecision): Promise<void> {
  const key = `${md.contextId}:${md.action}`;
  if (persisted.has(key)) return;
  persisted.add(key);

  const engines = [md.engines.dataQuality, md.engines.contradictions, md.engines.riskGate]
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .map((e) => ({
      engine_name: e.engine_name,
      engine_version: e.engine_version,
      status: e.status,
      confidence: e.confidence,
      evidence: e.evidence,
      warnings: e.warnings,
      latency_ms: e.latency_ms,
      input_context_id: e.input_context_id,
    }));

  try {
    await persistAnalysisRun({
      data: {
        contextId: md.contextId,
        symbol: md.symbol,
        timeframe: md.timeframe,
        action: md.action,
        confidence: md.confidence,
        rawConfidence: md.rawConfidence,
        positionMultiplier: md.positionMultiplier,
        dataQualityScore: md.engines.dataQuality.result?.score ?? 0,
        reasons: md.reasons.slice(0, 50),
        engineVersions: md.engineVersions,
        riskViolations: (md.engines.riskGate?.result?.violations ?? []) as unknown as Record<string, unknown>[],
        contradictions: (md.engines.contradictions?.result?.contradictions ?? []) as unknown as Record<string, unknown>[],
        explanation: (md.analysis?.recommendation.explanation ?? null) as Record<string, unknown> | null,
        engines,
        qualityIssues: md.engines.dataQuality.result?.issues ?? [],
      },
    });
  } catch (err) {
    persisted.delete(key);
    console.warn('Failed to persist analysis run', err);
  }
}
