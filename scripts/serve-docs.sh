#!/usr/bin/env bash
#
# serve-docs.sh — bring up everything needed to browse AEOS API docs locally.
#
# Auto-detects services already running (in Docker, or natively from a prior
# run) and skips starting them. Always builds the api-docs aggregator portal
# and points it at whatever is already listening on the standard ports.
#
# Modes:
#   ./scripts/serve-docs.sh                 — start what's missing, open portal
#   ./scripts/serve-docs.sh portal-only     — only build & start the portal
#   ./scripts/serve-docs.sh rebuild-docker  — `docker-compose up -d --build` first
#                                             (use after editing src/openapi.ts
#                                              or main.ts so /docs ships)
#   ./scripts/serve-docs.sh stop            — stop natively-started procs
#                                             + `docker-compose down`
#
# Per-service docs URLs:
#   substrate         http://localhost:3002/docs
#   telemetry         http://localhost:3003/docs
#   recommendations   http://localhost:3004/docs
#   test-generator    http://localhost:3005/docs
#   discovery         http://localhost:3006/docs
#   portal            http://localhost:5174

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RUN_DIR="$ROOT/.docs-run"
LOG_DIR="$RUN_DIR/logs"
PID_DIR="$RUN_DIR/pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

log()  { printf "\033[1;36m[docs]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[docs]\033[0m %s\n" "$*" >&2; }
die()  { printf "\033[1;31m[docs]\033[0m %s\n" "$*" >&2; exit 1; }

MODE="${1:-default}"

# ── stop ──────────────────────────────────────────────────────────────────────
stop_all() {
  log "stopping natively-launched processes (if any)"
  if [[ -d "$PID_DIR" ]]; then
    for pidfile in "$PID_DIR"/*.pid; do
      [[ -f "$pidfile" ]] || continue
      local name pid
      name="$(basename "$pidfile" .pid)"
      pid="$(cat "$pidfile" 2>/dev/null || true)"
      if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        log "  kill $name (pid $pid)"
        kill "$pid" 2>/dev/null || true
      fi
      rm -f "$pidfile"
    done
  fi
  log "stopping docker stack (local-dev)"
  (cd local-dev && docker-compose down) || true
  log "done"
}

if [[ "$MODE" == "stop" ]]; then
  stop_all
  exit 0
fi

# ── prereqs ───────────────────────────────────────────────────────────────────
command -v pnpm   >/dev/null || die "pnpm not on PATH (npm i -g pnpm@9)"
command -v docker >/dev/null || die "docker not on PATH"
command -v curl   >/dev/null || die "curl not on PATH"

# ── 1. pnpm install + build shared packages ───────────────────────────────────
log "step 1 — pnpm install"
pnpm install

log "step 2 — build shared TS packages (canonical-schema, openapi-helpers, auth/event-bus/registry/telemetry SDK)"
pnpm \
  --filter @aeos/canonical-schema \
  --filter @aeos/openapi-helpers \
  --filter @aeos/auth-client \
  --filter @aeos/telemetry-sdk \
  --filter @aeos/event-bus-client \
  --filter @aeos/registry-client \
  build

# ── helpers ───────────────────────────────────────────────────────────────────
port_up()    { curl -fsS -o /dev/null --max-time 1 "http://localhost:$1/healthz"; }
docs_up()    { curl -fsS -o /dev/null --max-time 1 "http://localhost:$1/docs"; }

start_node_service() {
  local name="$1" workdir="$2" port="$3"
  if port_up "$port"; then
    log "  $name already up on :$port — skipping start"
    return
  fi
  local logfile="$LOG_DIR/$name.log" pidfile="$PID_DIR/$name.pid"
  log "  starting $name natively (logs → $logfile)"
  ( cd "$workdir" && nohup pnpm dev >"$logfile" 2>&1 & echo $! >"$pidfile" )
}

start_python_service() {
  local name="$1" workdir="$2" port="$3"
  if port_up "$port"; then
    log "  $name already up on :$port — skipping start"
    return
  fi
  local logfile="$LOG_DIR/$name.log" pidfile="$PID_DIR/$name.pid"
  if [[ ! -x "$workdir/.venv/bin/uvicorn" ]]; then
    warn "  $name venv missing at $workdir/.venv — bootstrapping"
    ( cd "$workdir" && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]" )
  fi
  log "  starting $name natively on :$port (logs → $logfile)"
  ( cd "$workdir" && nohup .venv/bin/uvicorn src.main:app --host 0.0.0.0 --port "$port" \
      >"$logfile" 2>&1 & echo $! >"$pidfile" )
}

wait_port() {
  local port="$1" name="$2" tries=60
  while (( tries-- > 0 )); do
    if port_up "$port"; then return; fi
    sleep 1
  done
  warn "  $name did not respond at :$port/healthz within 60s"
}

# ── 3. docker stack ───────────────────────────────────────────────────────────
if [[ "$MODE" == "rebuild-docker" ]]; then
  log "step 3 — docker-compose up -d --build (rebuilding service images)"
  (cd local-dev && docker-compose up -d --build)
elif [[ "$MODE" == "portal-only" ]]; then
  log "step 3 — skipping docker stack (portal-only mode)"
else
  log "step 3 — docker-compose up -d (no-op if already running)"
  (cd local-dev && docker-compose up -d)
fi

# ── 4. ensure each service is up (skip if already listening) ──────────────────
if [[ "$MODE" != "portal-only" ]]; then
  log "step 4 — verifying services on :3002–:3006"
  start_node_service   substrate         "$ROOT/services/substrate"        3002
  wait_port 3002 substrate
  start_python_service telemetry         "$ROOT/services/telemetry"        3003
  wait_port 3003 telemetry
  start_python_service recommendations   "$ROOT/services/recommendations"  3004
  wait_port 3004 recommendations
  start_node_service   test-generator    "$ROOT/services/test-generator"   3005
  wait_port 3005 test-generator
  start_node_service   discovery         "$ROOT/services/discovery"        3006
  wait_port 3006 discovery

  # Detect running images that pre-date the /docs endpoints. The portal will
  # 404 against these — surface it loudly so the user knows to rebuild.
  log "step 4b — checking each service exposes /docs"
  missing=()
  for entry in "substrate:3002" "telemetry:3003" "recommendations:3004" \
               "test-generator:3005" "discovery:3006"; do
    name="${entry%%:*}"; port="${entry##*:}"
    if ! docs_up "$port"; then
      missing+=("$name (:$port)")
    fi
  done
  if (( ${#missing[@]} > 0 )); then
    warn "the following services do NOT expose /docs:"
    for m in "${missing[@]}"; do warn "  - $m"; done
    warn "Their running image was built before the /docs wiring landed."
    warn "Rebuild + restart them with:"
    warn "  ./scripts/serve-docs.sh rebuild-docker"
  fi
fi

# ── 5. portal ─────────────────────────────────────────────────────────────────
log "step 5 — starting api-docs portal on :5174"
if curl -fsS -o /dev/null --max-time 1 "http://localhost:5174"; then
  log "  portal already up on :5174 — skipping start"
else
  pidfile="$PID_DIR/api-docs.pid"
  logfile="$LOG_DIR/api-docs.log"
  ( cd "$ROOT/apps/api-docs" && nohup pnpm dev >"$logfile" 2>&1 & echo $! >"$pidfile" )
  tries=30
  while (( tries-- > 0 )); do
    if curl -fsS -o /dev/null --max-time 1 "http://localhost:5174"; then break; fi
    sleep 1
  done
fi

# ── 6. open browser ───────────────────────────────────────────────────────────
log "step 6 — opening http://localhost:5174"
if   command -v open     >/dev/null; then open http://localhost:5174
elif command -v xdg-open >/dev/null; then xdg-open http://localhost:5174
fi

cat <<EOF

  AEOS API docs ready.

    portal           http://localhost:5174
    substrate        http://localhost:3002/docs
    telemetry        http://localhost:3003/docs
    recommendations  http://localhost:3004/docs
    test-generator   http://localhost:3005/docs
    discovery        http://localhost:3006/docs

  Logs:           $LOG_DIR
  Rebuild docker: ./scripts/serve-docs.sh rebuild-docker
  Stop:           ./scripts/serve-docs.sh stop
EOF
