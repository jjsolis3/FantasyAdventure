#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL is not set. Set it in the Coolify environment variables tab." >&2
  exit 1
fi

# Postgres and the app usually start together, so the first connection attempt
# often lands before the database is accepting connections.
#
# Waiting on connectivity here — rather than retrying `migrate deploy` blindly —
# keeps the two failure modes apart. A database that is merely slow to start
# retries quietly; a genuinely broken migration reports its real error once,
# instead of scrolling the same stack trace past you thirty times.
echo "Waiting for the database…"
attempt=1
max_attempts=30
until node -e "
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  client.connect()
    .then(() => client.end())
    .catch((error) => { console.error('  ' + error.message); process.exit(1); });
" 2>&1; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "FATAL: database unreachable after $max_attempts attempts." >&2
    echo "Check that DATABASE_URL uses the Postgres resource's INTERNAL hostname," >&2
    echo "and that the app is attached to the database's Docker network." >&2
    exit 1
  fi
  echo "  not ready (attempt $attempt/$max_attempts), retrying in 2s…"
  attempt=$((attempt + 1))
  sleep 2
done
echo "Database is reachable."

echo "Applying migrations…"
if ! npx prisma migrate deploy; then
  echo "FATAL: migrations failed. See the error above." >&2
  exit 1
fi
echo "Migrations applied."

# Seeding is idempotent (every storyline is upserted by slug), so it is safe to
# run on every boot. Set SEED_ON_START=false once the storyline set is stable
# and you would rather manage it by hand.
if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "Seeding storylines…"
  npx tsx prisma/seed.ts || echo "WARN: seed failed; continuing without it." >&2
fi

exec "$@"
