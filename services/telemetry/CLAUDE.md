# Telemetry Service (Python)

**What this service does:** Ingests OTel-shaped agent spans via `POST /v1/spans`, classifies their kind, enriches them with `process_id` from the substrate Process Registry, mirrors them to LangFuse for observability, and emits canonical `telemetry.span.enriched` events to Kafka for the Intelligence service to consume.

Spec reference: FuzeBox_AEOS_Architecture_Plan_v0_6.docx §4 (Telemetry layer); `docs/architecture/service-map.md` Telemetry row.

Reference implementation borrowed from: `/Users/fernandogoldstein/fuzebox/fuzebox-intelligence` (AITT POC) — patterns for idempotent ingestion, mapping cache, agent discovery. AITT is **not** a runtime dependency; only patterns were transplanted.

---

## Service Boundaries

**Owns:**
- `spans` Postgres table — enriched, classified spans (queryable for ~30 days, retention configurable)

**Reads from:**
- Substrate `ProcessRegistry` (uop_id → process_id)
- Substrate `AgentRegistry` (validate agent_id existence)
- LangFuse (write-only mirror)

**Emits to Event Bus:**
- `telemetry.span.enriched` — for every successfully enriched span

**Consumes from Event Bus:**
- None (ingestion service — input is HTTP, not Kafka)

**Does NOT own:**
- Raw, un-enriched OTLP spans (those flow OTel collector → LangFuse directly)
- LedgerRow data (Intelligence consumes our output and writes ledger rows)
- UoP / Process / Agent records (substrate owns the registries)

---

## API Surface

All endpoints under `/v1/`. Swagger docs at `/docs` (local only).

```
POST   /v1/spans                                  — batch ingest (max 500 spans/req) — telemetry ingest token
GET    /v1/spans?agent_id=&uop_id=&kind=&...      — substrate JWT
GET    /v1/spans/:span_id                         — substrate JWT
GET    /v1/traces/:trace_id                       — substrate JWT
POST   /v1/admin/telemetry-tokens                 — substrate JWT (tenant admin) → mint
GET    /v1/admin/telemetry-tokens                 — substrate JWT (tenant admin) → list
DELETE /v1/admin/telemetry-tokens/:id             — substrate JWT (tenant admin) → revoke
GET    /healthz
GET    /readyz
```

Every span in `POST /v1/spans` must carry `tenant_id` matching the ingest
token's `tenant_id`. Mismatches yield a per-span `error: tenant_mismatch`
result with HTTP 202 (other spans in the batch may still succeed).

---

## Pipeline

```
POST /v1/spans
  ├─ classify(name) → SpanKind
  ├─ enricher.resolve_process_id(uop_id) [30s TTL cache]
  ├─ insert_span(...) [ON CONFLICT (tenant_id, span_id) DO NOTHING]
  ├─ langfuse.mirror(...) [best effort]
  ├─ emitter.emit_enriched(...) → aeos.{tid}.telemetry.telemetry.span.enriched
  └─ agent_discovery.observe(agent_id) [best effort]
```

Spans without a `uop_id` are stored but **not** emitted to Kafka — the
`TelemetrySpanEnrichedEvent` contract requires `uop_id` and `process_id`.
Operators can backfill via `PATCH` (future) once the UoP is mapped.

---

## Shared Components

### Auth — split between admin endpoints and ingest

**Ingest (`POST /v1/spans`):** uses telemetry-issued **ingest tokens**, not user
JWTs. Format: `aeos_tlm_<payload>.<hmac>`. Telemetry signs with
`TELEMETRY_TOKEN_SIGNING_SECRET` (HS256-style HMAC) and verifies locally — no
remote calls, no per-request DB lookups. Revocation is handled by an
in-memory set refreshed every `TELEMETRY_REVOCATION_REFRESH_SECONDS` (default
60s) from `telemetry_ingest_tokens`. Worst-case revocation latency = the
refresh interval.

Tenant isolation: each ingest token carries a single `tenant_id` in its
signed payload; every span in the batch must match it (per-span
`tenant_mismatch` result otherwise). Source of truth is the token, never the
span body.

**Admin (`POST/GET/DELETE /v1/admin/telemetry-tokens`):** uses the regular
substrate user JWT via `Depends(get_current_auth)`, gated to roles `admin`,
`tenant_admin`, or `platform_admin`. Tenant admins mint and revoke ingest
tokens for their own tenant.

**Query (`GET /v1/spans...`):** still uses the substrate user JWT
(`get_current_auth`) — it's a human/UI-facing API, not a high-volume ingest
path.

**Telemetry → substrate calls** (process registry lookups, agent discovery)
need outbound auth. When the inbound request authenticates via an ingest
token there is no upstream JWT to forward, so `auth/service_jwt.py` mints a
short-lived HS256 service JWT signed with `AUTH_JWT_SECRET`. This works for
local dev and any env that runs HS256. Production with JWKS-only verification
will need a substrate-issued service-account credential — tracked as a
follow-up.

Env: `TELEMETRY_TOKEN_SIGNING_SECRET` (≥32 bytes), `AUTH_JWT_SECRET` (local)
or `AUTH_JWKS_URI` (prod), `AUTH_SERVICE_URL`.

### Canonical Types (`aeos-canonical-schema`)
- `AeosSpan`, `SpanKind`, `SpanStatus`, `SpanAttributes`, `SpanEvent`
- `TelemetrySpanEnrichedEvent` (event payload contract)

**PATENT NOTE:** Do not modify `LedgerRow`, `Boundary`, `UoP`, `Attestation` fields without CTO approval (danny.goldstein@fuzebox.ai). Telemetry does not touch these directly.

### Event Bus (`aeos-event-bus-client`)
**Produced:** `telemetry.span.enriched` on `aeos.{tenant_id}.telemetry.telemetry.span.enriched`
**Consumed:** none

### Registries (`aeos-registry-client`)
- `ProcessRegistry.list_by_uop(uop_id)` — returns active processes for enrichment
- `AgentRegistry.get(agent_id)` — validates agent exists (best-effort)

---

## Local Development

```bash
cd services/telemetry
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

# Bring up deps (Kafka, Postgres, LangFuse, OTel collector, Substrate)
cd ../../local-dev && docker-compose up -d

# Run migrations
cd ../services/telemetry
alembic upgrade head

# Run service
uvicorn src.main:app --reload --port 3003
```

Tests:
```bash
pytest tests/unit/
pytest tests/integration/   # requires local stack
```

---

## Database

- Engine: Postgres (asyncpg driver at runtime, psycopg2 for Alembic migrations)
- Migrations: Alembic (`alembic/versions/`)
- Run: `alembic upgrade head`

**Rules:**
- Every table has `tenant_id TEXT NOT NULL`.
- Every query filters by `tenant_id`.
- Idempotency on `(tenant_id, span_id)` — re-POSTing the same span is a no-op.

---

## Key Non-Negotiables

- `tenant_id` on every row, cache key, Kafka event.
- v1 observational only — never blocks an agent's runtime path.
- Auth on every endpoint (except `/healthz`, `/readyz`).
- Spans missing `uop_id` are stored locally but **not** emitted to Kafka — the enriched-event contract requires both `uop_id` and `process_id`.

---

## Configuration Reference

| Env Var | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | 3003 |
| `DATABASE_URL` | Postgres connection | — (required) |
| `AUTH_JWT_SECRET` | HS256 secret (local dev) | — |
| `AUTH_JWKS_URI` | JWKS URL (prod) | — |
| `AUTH_SERVICE_URL` | Substrate base URL | — (required) |
| `REGISTRY_URL` | Substrate base URL (registry endpoints) | — (required) |
| `KAFKA_BROKERS` | comma-separated brokers | localhost:9092 |
| `LANGFUSE_HOST` | LangFuse base URL | http://localhost:3001 |
| `LANGFUSE_PUBLIC_KEY` | LangFuse pk | pk-lf-local-dev |
| `LANGFUSE_SECRET_KEY` | LangFuse sk | sk-lf-local-dev |
| `LANGFUSE_ENABLED` | toggle off if LangFuse unavailable | true |
| `ENRICHMENT_VERSION` | written into every emitted event | 1.0 |
| `ENRICHMENT_CACHE_TTL_SECONDS` | uop→process cache TTL | 30 |
