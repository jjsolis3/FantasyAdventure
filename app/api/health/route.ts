import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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
export async function GET() {
  const checkedAt = new Date().toISOString();
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
    },
    { status: database.ok ? 200 : 503 },
  );
}
