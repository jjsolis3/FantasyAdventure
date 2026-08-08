import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { probe } from "@/lib/ai/provider";
import { resolveAiConfig } from "@/lib/ai/settings";

// Always hit the database rather than serving a cached "healthy" from build time.
export const dynamic = "force-dynamic";

const startedAt = Date.now();

/**
 * Coolify's healthcheck target.
 *
 * Reports degraded-but-reachable separately from fully healthy: the container
 * answering at all means Next.js booted, while `database.ok` tells you whether
 * the Postgres resource is actually wired up. Returns 503 when the database is
 * unreachable so Coolify marks the deployment unhealthy instead of routing to it.
 */
export async function GET(request: Request) {
  const checkedAt = new Date().toISOString();

  // The model is reported as configured-or-not by default. Actually calling it
  // costs seconds on a local server, and Coolify polls this every 15s — so a
  // live probe is opt-in via /api/health?ai=1.
  const wantsAiProbe = new URL(request.url).searchParams.get("ai") === "1";
  let ai: { configured: boolean; model?: string; reachable?: boolean; detail?: string };

  try {
    const config = await resolveAiConfig();
    ai = { configured: true, model: config.model };
    if (wantsAiProbe) {
      const result = await probe(config);
      ai.reachable = result.ok;
      ai.detail = result.detail;
    }
  } catch (error) {
    ai = { configured: false, detail: error instanceof Error ? error.message : String(error) };
  }
  let database: { ok: boolean; latencyMs?: number; storylines?: number; error?: string };

  const started = performance.now();
  try {
    const storylines = await db.storyline.count();
    database = {
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      storylines,
    };
  } catch (error) {
    database = {
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return NextResponse.json(
    {
      status: database.ok ? "healthy" : "degraded",
      service: "hearthlight",
      version: process.env.APP_VERSION ?? "dev",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      checkedAt,
      database,
      // Deliberately not part of the healthy/degraded verdict: the app is still
      // usable with the model down — you can read the journal and edit
      // characters — and a flaky LAN model must not cause Coolify to roll back
      // a perfectly good deployment.
      ai,
    },
    { status: database.ok ? 200 : 503 },
  );
}
