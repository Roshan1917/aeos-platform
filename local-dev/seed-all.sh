#!/usr/bin/env bash
# seed-all.sh — run every dev seed script in dependency order.
#
# Prereqs (must already be running):
#   - docker compose up -d (postgres, kafka, openfga, redis, etc.)
#   - substrate on :3002       (cd services/substrate && pnpm dev)
#   - telemetry on :3003       (cd services/telemetry && uvicorn src.main:app --port 3003)
#     telemetry is optional — only required for seed-telemetry-token + seed-spans.
#
# Usage:
#   ./local-dev/seed-all.sh            # full seed (skips telemetry steps if :3003 down)
#   SKIP_TELEMETRY=1 ./local-dev/seed-all.sh
#   SKIP_SPANS=1 ./local-dev/seed-all.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

SUBSTRATE_URL="${AUTH_SERVICE_URL:-http://localhost:3002}"
TELEMETRY_URL="${TELEMETRY_SERVICE_URL:-http://localhost:3003}"

step() { printf "\n\033[1;36m▶ %s\033[0m\n" "$1"; }
ok()   { printf "\033[1;32m✔ %s\033[0m\n" "$1"; }
warn() { printf "\033[1;33m! %s\033[0m\n" "$1"; }
die()  { printf "\033[1;31m✘ %s\033[0m\n" "$1"; exit 1; }

wait_for() {
  local name="$1" url="$2" tries="${3:-30}"
  for i in $(seq 1 "$tries"); do
    if curl -sf -o /dev/null "$url"; then ok "$name reachable"; return 0; fi
    sleep 1
  done
  return 1
}

# ── 0. Kafka topics ────────────────────────────────────────────────────────────
step "Creating Kafka topics"
bash "$SCRIPT_DIR/seed/kafka-topics.sh"

# ── 1. OpenFGA model + tuples ──────────────────────────────────────────────────
step "Seeding OpenFGA model + bootstrap tuples"
pnpm tsx "$SCRIPT_DIR/seed/seed-openfga.ts"

# ── 2. Substrate must be up before tenant/registry seeds ───────────────────────
step "Checking substrate ($SUBSTRATE_URL)"
if ! wait_for "substrate" "$SUBSTRATE_URL/healthz" 5; then
  die "substrate not reachable at $SUBSTRATE_URL — start it (cd services/substrate && pnpm dev) and re-run"
fi

# ── 3. Tenant + admin user ─────────────────────────────────────────────────────
step "Seeding dev tenant + admin user"
pnpm tsx "$SCRIPT_DIR/seed/seed-tenant.ts"

# ── 4. Registries (UoPs, Processes, Agents) ────────────────────────────────────
step "Seeding registries (UoPs / Processes / Agents)"
pnpm tsx "$SCRIPT_DIR/seed/seed-registries.ts"

# ── 5. Telemetry token (optional — needs telemetry up) ─────────────────────────
if [[ "${SKIP_TELEMETRY:-0}" == "1" ]]; then
  warn "SKIP_TELEMETRY=1 — skipping telemetry token + spans"
else
  step "Checking telemetry ($TELEMETRY_URL)"
  if wait_for "telemetry" "$TELEMETRY_URL/healthz" 3; then
    step "Minting telemetry ingest token"
    pnpm tsx "$SCRIPT_DIR/seed/seed-telemetry-token.ts"

    if [[ "${SKIP_SPANS:-0}" == "1" ]]; then
      warn "SKIP_SPANS=1 — skipping span seed"
    else
      step "Emitting synthetic spans"
      pnpm tsx "$SCRIPT_DIR/seed/seed-spans.ts"
    fi
  else
    warn "telemetry not up at $TELEMETRY_URL — skipping token + spans (re-run after starting telemetry)"
  fi
fi

printf "\n\033[1;32m✔ All seeds complete.\033[0m\n"
