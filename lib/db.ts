import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 dropped the bundled Rust query engine: the client now talks to
// Postgres through a driver adapter, and the connection string is passed to the
// adapter rather than declared in schema.prisma.
function createClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env for local development, " +
        "or set it in the Coolify environment variables tab.",
    );
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

type Client = ReturnType<typeof createClient>;

// Next.js dev mode re-evaluates modules on every hot reload. Without caching the
// client on globalThis, each reload opens a new connection pool until Postgres
// starts refusing connections.
const globalForPrisma = globalThis as unknown as { prisma: Client | undefined };

/**
 * The one client, made on demand.
 *
 * `cached` is not the same thing as the global above and cannot be folded into
 * it: the global exists only to survive a hot reload in development, while this
 * exists to make sure a single module evaluation opens a single connection pool.
 * Without it every property access on `db` would build another one, and Postgres
 * starts refusing connections within a handful of requests.
 */
let cached: Client | undefined;

function client(): Client {
  if (cached) return cached;

  cached = globalForPrisma.prisma ?? createClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = cached;
  return cached;
}

/**
 * The database client, connected on first use rather than on import.
 *
 * The laziness is not an optimisation. `next build` evaluates every route
 * module to collect its configuration, so a client constructed at import time
 * makes DATABASE_URL a *build* requirement — and the build then fails inside a
 * Docker image builder, which has no database and no reason to have one, with
 * "Failed to collect page data" over a message about a variable that is set
 * perfectly well at runtime.
 *
 * Reaching for a property is what resolves it, so the error still arrives on
 * the first real query, in the request that made it.
 */
/**
 * Whether a failure was a unique constraint refusing a duplicate.
 *
 * Several places here deliberately race the database rather than locking round
 * it — two devices opening a round, two adventures drawing the same join code —
 * and in each the constraint doing its job is an expected answer rather than an
 * error, so the code that recognises it belongs in one place.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export const db: Client = new Proxy({} as Client, {
  get(_target, property) {
    const instance = client() as unknown as Record<string | symbol, unknown>;
    const value = instance[property];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
