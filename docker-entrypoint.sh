#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL is not set. Set it in the Coolify environment variables tab." >&2
  exit 1
fi

# Postgres and the app usually start together, so the first connection attempt
# often lands before the database is accepting connections. Retry rather than
# crash-looping the container.
echo "Waiting for the database…"
attempt=1
max_attempts=30
until npx prisma migrate deploy 2>&1; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "FATAL: migrations failed after $max_attempts attempts." >&2
    exit 1
  fi
  echo "  migrate failed (attempt $attempt/$max_attempts), retrying in 2s…"
  attempt=$((attempt + 1))
  sleep 2
done
echo "Migrations applied."

# Seeding is idempotent (every storyline is upserted by slug), so it is safe to
# run on every boot. Set SEED_ON_START=false once the storyline set is stable
# and you would rather manage it by hand.
if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "Seeding storylines…"
  npx tsx prisma/seed.ts || echo "WARN: seed failed; continuing without it." >&2
fi

exec "$@"
