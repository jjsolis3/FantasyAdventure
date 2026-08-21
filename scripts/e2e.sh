#!/usr/bin/env bash
#
# Every browser test, each against a fresh database.
#
# ## Why this exists rather than a chain of `&&` in package.json
#
# It was a chain of `&&`, and that had two consequences nobody noticed for a
# long time. The third test in the list started failing when the character
# builder grew a stat allocator, so the twelve after it never ran at all — and
# because the list was written by hand it had drifted to fifteen of the thirty
# files that exist, so half the suite was never in it to begin with.
#
# So this keeps going past a failure and reports at the end. A first run after
# a long silence needs to say *how much* is broken, not stop at the first thing.
#
# ## Why the mock is restarted per test
#
# Several tests need the storyteller to behave a particular way — to roll a
# named stat, to put something in front of the party, to agree that an
# objective happened, or to play a table going in circles. The mock takes its
# behaviour from the environment when it starts, so a single shared one cannot
# satisfy all of them. Each test's own header documents what it needs; that is
# mirrored in `passes_for` below, and the two must stay in step.
#
# One file is run more than once for the same reason. `pressure` proves both
# that a table getting on with things is not charged and that a table going in
# circles is, and those want opposite storytellers — so it is two runs against
# two mocks, not one.
#
# Usage:
#   DATABASE_URL=postgres://…  ./scripts/e2e.sh            # everything
#   DATABASE_URL=postgres://…  ./scripts/e2e.sh play luck  # just these
#
# Expects: a reachable Postgres, a built app (`npm run build`), and Chromium
# where Playwright can find it.
#
# Destructive — it drops and reseeds the database between tests. Point it at a
# scratch one, never a real one.
set -u

PORT="${E2E_PORT:-3399}"
MOCK_PORT="${E2E_MOCK_PORT:-11499}"

export E2E_BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:${PORT}}"
export AI_BASE_URL="http://127.0.0.1:${MOCK_PORT}/v1"
export AI_MODEL="${AI_MODEL:-mock}"
export AUTH_SECRET="${AUTH_SECRET:-test-secret-test-secret-test-secret}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. Point it at a scratch database." >&2
  exit 1
fi

ALL=(
  auth characters campaigns play rounds invites quests loadout growth knacks
  acquaintances personal-quests progression settings admin screen bonds
  briefing chapters chronicle encounters luck pressure rebalance reset
  table-dice table-view talk ties wardrobe
)

TESTS=("$@")
[ ${#TESTS[@]} -eq 0 ] && TESTS=("${ALL[@]}")

# What each test needs the storyteller to be doing, as one line per run of the
# file. Most want a single run; `pressure` is two, because its two halves need
# the storyteller behaving in opposite ways and one process cannot do both.
#
# The setting is exported to the test as well as to the mock. That matters for
# `pressure`, which reads MOCK_IDLE itself to choose which half to check: give
# it to only the mock and the test checks the busy half against an idle
# storyteller, so every turn is charged for going in circles and the clock reads
# full where the test wanted nought. It looks exactly like a product bug, and it
# is not one — which is why the variable now goes to both.
#
# Kept beside the list rather than inside the tests, because it configures a
# process the tests do not start. Each test's own header documents what it
# needs, and the two must stay in step.
passes_for() {
  case "$1" in
    pressure)   printf '%s\n' "" "MOCK_IDLE=1" ;;
    luck)       printf '%s\n' "MOCK_STAT=grace" ;;
    encounters) printf '%s\n' "MOCK_ENCOUNTER=1" ;;
    rebalance)  printf '%s\n' "MOCK_TICK=1" ;;
    table-view) printf '%s\n' "MOCK_IDLE=1" ;;
    *)          printf '%s\n' "" ;;
  esac
}

# Drops everything and rebuilds it.
#
# Loud on failure, because the first version of this hid the error. The reset
# command it used had picked up flags that no longer exist, so it failed every
# time, silently — sixteen tests then ran against whatever the previous one had
# left behind, and the summary reported sixteen failures that were not real. A
# harness that lies about the state it set up is worse than no harness.
#
# Plain SQL rather than `prisma migrate reset`, for two reasons: that command's
# flags have changed between versions, and it now refuses to run unattended
# without an explicit consent variable — which is right, and makes it the wrong
# tool for a script somebody may run through an agent.
reset_database() {
  # `?schema=public` is Prisma's, not libpq's, and psql refuses a URI carrying
  # it — so the query string comes off before this is handed over.
  psql "${DATABASE_URL%%\?*}" -q -v ON_ERROR_STOP=1 \
    -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' || return 1

  npx prisma migrate deploy > /tmp/e2e-migrate.log 2>&1 || {
    echo "  migrate deploy failed — see /tmp/e2e-migrate.log" >&2
    return 1
  }

  npm run seed > /tmp/e2e-seed.log 2>&1 || {
    echo "  seed failed — see /tmp/e2e-seed.log" >&2
    return 1
  }
}

wait_for() {
  for _ in $(seq 1 40); do
    curl -s -o /dev/null "$1" && return 0
    sleep 1
  done
  return 1
}

cleanup() {
  pkill -f "mock-model-serv[e]r" >/dev/null 2>&1
  pkill -f "next-serv[e]r" >/dev/null 2>&1
}
trap cleanup EXIT

RESULTS=()
for test in "${TESTS[@]}"; do
  file="tests/${test}.e2e.mts"
  if [ ! -f "$file" ]; then
    RESULTS+=("skip  ${test} — no such file")
    continue
  fi

  mapfile -t PASSES < <(passes_for "$test")

  for envs in "${PASSES[@]}"; do
    # Only worth distinguishing when there is more than one, and then it is the
    # setting that tells them apart rather than a number.
    label="$test"
    [ "${#PASSES[@]}" -gt 1 ] && label="${test} [${envs:-no switches}]"
    slug="${label//[^a-zA-Z0-9]/-}"

    echo "════════════════ ${label} ════════════════"
    cleanup
    sleep 1

    # A fresh database. Each of these registers the first household through the
    # bootstrap invite, so they need an empty accounts table and a seeded
    # library — and a second pass of the same file needs it every bit as much as
    # the first, since the pass before it has already filled a clock.
    if ! reset_database; then
      echo "  stopping rather than testing against a dirty database." >&2
      RESULTS+=("ABORT ${label} — database reset failed")
      break 2
    fi

    # shellcheck disable=SC2046
    env $envs setsid npx tsx tests/mock-model-server.mts "${MOCK_PORT}" \
      > "/tmp/e2e-mock-${slug}.log" 2>&1 < /dev/null &
    disown
    wait_for "http://127.0.0.1:${MOCK_PORT}/v1/models" || echo "  (the mock never came up)"

    setsid npx next start -p "${PORT}" > "/tmp/e2e-server-${slug}.log" 2>&1 < /dev/null &
    disown
    wait_for "${E2E_BASE_URL}/login" || echo "  (the app never came up)"

    # shellcheck disable=SC2046
    if env $envs npx tsx "$file"; then
      RESULTS+=("PASS  ${label}")
    else
      RESULTS+=("FAIL  ${label}")
    fi
  done
done

echo
echo "════════════════ summary ════════════════"
printf '%s\n' "${RESULTS[@]}"
printf '%s\n' "${RESULTS[@]}" | grep -q "^FAIL" && exit 1
exit 0
