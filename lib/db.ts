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

// Next.js dev mode re-evaluates modules on every hot reload. Without caching the
// client on globalThis, each reload opens a new connection pool until Postgres
// starts refusing connections.
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
