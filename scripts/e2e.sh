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
# mirrored in `mock_env_for` below, and the two must stay in step.
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

# What each test needs the storyteller to be doing. Kept beside the list rather
# than inside the tests, because it configures a process the tests do not start.
mock_env_for() {
  case "$1" in
    luck)       echo "MOCK_STAT=grace" ;;
    encounters) echo "MOCK_ENCOUNTER=1" ;;
    rebalance)  echo "MOCK_TICK=1" ;;
    table-view) echo "MOCK_IDLE=1" ;;
    pressure)   echo "MOCK_IDLE=1" ;;
    *)          echo "" ;;
  esac
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

  echo "════════════════ ${test} ════════════════"
  cleanup
  sleep 1

  # A fresh database. Each of these registers the first household through the
  # bootstrap invite, so they need an empty accounts table and a seeded library.
  npx prisma migrate reset --force --skip-generate --skip-seed >/dev/null 2>&1
  npm run seed >/dev/null 2>&1

  # shellcheck disable=SC2046
  env $(mock_env_for "$test") setsid npx tsx tests/mock-model-server.mts "${MOCK_PORT}" \
    > "/tmp/e2e-mock-${test}.log" 2>&1 < /dev/null &
  disown
  wait_for "http://127.0.0.1:${MOCK_PORT}/v1/models" || echo "  (the mock never came up)"

  setsid npx next start -p "${PORT}" > "/tmp/e2e-server-${test}.log" 2>&1 < /dev/null &
  disown
  wait_for "${E2E_BASE_URL}/login" || echo "  (the app never came up)"

  if npx tsx "$file"; then
    RESULTS+=("PASS  ${test}")
  else
    RESULTS+=("FAIL  ${test}")
  fi
done

echo
echo "════════════════ summary ════════════════"
printf '%s\n' "${RESULTS[@]}"
printf '%s\n' "${RESULTS[@]}" | grep -q "^FAIL" && exit 1
exit 0
