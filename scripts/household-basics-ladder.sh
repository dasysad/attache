#!/usr/bin/env bash
# Household basics ladder — agent-first dogfood on a clean data dir.
# Usage: ./scripts/household-basics-ladder.sh
# Exits non-zero on first failing step.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/attache-ladder-XXXXXX")"
export ATTACHE_DATA_DIR="$DATA_DIR"

cleanup() {
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

echo "==> Ladder data dir: $ATTACHE_DATA_DIR"

pnpm --filter @attache/core build >/dev/null
pnpm --filter @attache/cli build >/dev/null

attache() {
  echo "==> attache $*"
  node "$ROOT/packages/cli/dist/main.js" "$@"
}

attache onboard --household "Smith" --holder "Alex"
attache setup status
attache accounts create --name Checking --balance 2500
attache obligations create --payee Rent --amount 1800 --due 2026-09-01 --cadence monthly
attache members add --name Jordan --kind partner
attache income create --label Payroll --amount 5000 --cadence monthly --next 2026-09-01
attache assets create --kind home --label "123 Main" --estimate 450000
attache entities list
attache income list
attache cashflow
attache agent attention
attache setup complete

echo "==> Ladder OK"
