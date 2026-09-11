// ============================================================================
// Health check endpoint — GET /api/public/health
//
// Designed for load balancers, uptime monitors and CI smoke tests. Returns no
// user data, no configuration values and no secrets: only liveness of the
// runtime and reachability of the database, plus the build revision.
// 200 = serving traffic, 503 = dependency degraded.
// ============================================================================

import { createFileRoute } from "@tanstack/react-router";

import { errorFields, logger } from "@/lib/logger";

const DB_TIMEOUT_MS = 2_000;

type DependencyState = "ok" | "degraded" | "unconfigured";

async function checkDatabase(): Promise<DependencyState> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return "unconfigured";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DB_TIMEOUT_MS);
  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      signal: controller.signal,
    });
    return response.ok ? "ok" : "degraded";
  } catch (error) {
    logger.warn("health.database_unreachable", errorFields(error));
    return "degraded";
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const startedAt = Date.now();
        const database = await checkDatabase();
        const healthy = database !== "degraded";

        return Response.json(
          {
            status: healthy ? "ok" : "degraded",
            checks: { runtime: "ok" as DependencyState, database },
            revision: process.env["BUILD_REVISION"] ?? "unknown",
            latency_ms: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
          },
          {
            status: healthy ? 200 : 503,
            headers: { "cache-control": "no-store" },
          },
        );
      },
    },
  },
});
