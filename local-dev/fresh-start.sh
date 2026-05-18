#!/usr/bin/env bash
# fresh-start.sh — bring the AEOS local stack from zero to fully seeded.
#
# What it does:
#   1. Tears down existing local-dev compose volumes (clean slate).
#   2. Builds + starts every container under the `services` profile.
#   3. Runs Prisma + Alembic migrations against the consolidated `aeos` DB.
#   4. Seeds OpenFGA (creates store + auth model), writes the IDs into
#      local-dev/.env, restarts substrate so it picks them up.
#   5. Seeds the dev tenant + bootstrap users via the substrate API.
#   6. Seeds the UoP / Process / Agent registries.
#   7. Creates Kafka topics for the dev tenant.
#
# After this runs, log in at http://localhost:5173/login as
# admin@dev-corp.local / DevPassword1234! (tenant slug `dev-corp`).
#
# Pre-reqs on host: pnpm 9+, Docker Desktop running, npx available.
# Re-running is safe; volumes are wiped only with --reset (default skips wipe
# on first run if the volumes are already absent).

set -euo pipefail

cd "$(dirname "$0")"
REPO_ROOT="$(cd .. && pwd)"

# Sanity check: refuse to run if the staging kubectl port-forward to OpenFGA
# is hogging localhost:8080 — the local seed would write to staging instead
# of the local container, leaving substrate looking up a model that never
# landed in its OpenFGA. (We've been bitten by this; the failure mode is
# `authorization_model_not_found` on every POST /v1/tenants.)
if lsof -nP -iTCP:8080 -sTCP:LISTEN 2>/dev/null | grep -qE '^kubectl|^kubectx'; then
  echo "ERROR: kubectl is holding localhost:8080 (likely an openfga port-forward to staging)."
  echo "       Kill it before running fresh-start, otherwise OpenFGA seeding writes"
  echo "       to staging instead of the local container."
  lsof -nP -iTCP:8080 -sTCP:LISTEN
  exit 1
fi

RESET=0
for arg in "$@"; do
  case "$arg" in
    --reset) RESET=1 ;;
    --help|-h)
      sed -n '2,16p' "$0"
      exit 0
      ;;
  esac
done

if [[ "$RESET" -eq 1 ]]; then
  echo "==> [1/7] Tearing down existing stack + volumes (--reset)"
  docker compose --profile services down -v --remove-orphans
else
  echo "==> [1/7] Skipping teardown (pass --reset to wipe Postgres + Kafka volumes)"
fi

echo "==> [2/7] Building + starting all containers (--profile services)"
docker compose --profile services up -d --build

echo "    Waiting for postgres + kafka health..."
for i in {1..60}; do
  if docker compose ps postgres --format json 2>/dev/null | grep -q '"Health":"healthy"' \
     && docker compose ps kafka --format json 2>/dev/null | grep -q '"Health":"healthy"'; then
    break
  fi
  sleep 2
done

echo "==> [3/7] Running Prisma migrations (substrate, test-generator)"
( cd "$REPO_ROOT" && \
  DATABASE_URL='postgresql://aeos:aeos_dev_password@localhost:5432/aeos?schema=substrate' \
    npx --yes -p prisma@5.13.0 prisma migrate deploy \
    --schema=services/substrate/prisma/schema.prisma )
( cd "$REPO_ROOT" && \
  DATABASE_URL='postgresql://aeos:aeos_dev_password@localhost:5432/aeos?schema=test_generator' \
    npx --yes -p prisma@5.13.0 prisma migrate deploy \
    --schema=services/test-generator/prisma/schema.prisma )

echo "==> [4/7] Running Alembic migrations (telemetry, recommendations)"
docker compose run --rm --no-deps \
  -e DATABASE_URL='postgresql://aeos:aeos_dev_password@postgres:5432/aeos' \
  -e DATABASE_SCHEMA=telemetry \
  --entrypoint alembic telemetry upgrade head
docker compose run --rm --no-deps \
  -e DATABASE_URL='postgresql://aeos:aeos_dev_password@postgres:5432/aeos' \
  -e DATABASE_SCHEMA=recommendations \
  -e SUBSCRIBE_TENANT_IDS= \
  --entrypoint alembic recommendations upgrade head

echo "==> [5/7] Seeding OpenFGA (store + auth model)"
SEED_OUTPUT="$( cd "$REPO_ROOT" && pnpm tsx local-dev/seed/seed-openfga.ts 2>&1 )"
echo "$SEED_OUTPUT" | tail -10

STORE_ID="$(echo "$SEED_OUTPUT" | awk -F= '/^  OPENFGA_STORE_ID=/{print $2}' | tr -d '[:space:]')"
MODEL_ID="$(echo "$SEED_OUTPUT" | awk -F= '/^  OPENFGA_MODEL_ID=/{print $2}' | tr -d '[:space:]')"
if [[ -z "$STORE_ID" || -z "$MODEL_ID" ]]; then
  echo "ERROR: failed to parse OPENFGA_STORE_ID / OPENFGA_MODEL_ID from seed output"
  exit 1
fi

# Persist into local-dev/.env so subsequent compose runs reuse the IDs.
ENV_FILE="$(pwd)/.env"
touch "$ENV_FILE"
# Use a portable in-place sed (BSD vs GNU).
sed_inplace() {
  if [[ "$(uname)" == "Darwin" ]]; then sed -i '' "$@"; else sed -i "$@"; fi
}
if grep -q '^OPENFGA_STORE_ID=' "$ENV_FILE"; then
  sed_inplace -E "s|^OPENFGA_STORE_ID=.*|OPENFGA_STORE_ID=${STORE_ID}|" "$ENV_FILE"
else
  echo "OPENFGA_STORE_ID=${STORE_ID}" >> "$ENV_FILE"
fi
if grep -q '^OPENFGA_MODEL_ID=' "$ENV_FILE"; then
  sed_inplace -E "s|^OPENFGA_MODEL_ID=.*|OPENFGA_MODEL_ID=${MODEL_ID}|" "$ENV_FILE"
else
  echo "OPENFGA_MODEL_ID=${MODEL_ID}" >> "$ENV_FILE"
fi

echo "    Restarting substrate so it picks up the new OpenFGA IDs"
docker compose --profile services up -d substrate

echo "    Waiting for substrate /healthz..."
for i in {1..30}; do
  if curl -fsS http://localhost:3002/healthz >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> [6/7] Seeding dev tenant + users + registries"
( cd "$REPO_ROOT" && pnpm tsx local-dev/seed/seed-tenant.ts )
( cd "$REPO_ROOT" && pnpm tsx local-dev/seed/seed-registries.ts )

echo "==> [7/7] Creating Kafka topics"
bash "$(pwd)/seed/kafka-topics.sh"

echo
echo "✓ Stack ready."
echo "  Web:           http://localhost:5173"
echo "  Substrate API: http://localhost:3002"
echo "  Telemetry:     http://localhost:3003"
echo "  Recommendations: http://localhost:3004"
echo "  Test-Generator:  http://localhost:3005"
echo "  LangFuse:      http://localhost:3001"
echo "  OpenFGA:       http://localhost:8080"
echo
echo "  Login: admin@dev-corp.local / DevPassword1234! (tenant slug: dev-corp)"
