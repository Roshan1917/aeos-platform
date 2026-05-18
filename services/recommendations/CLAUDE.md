# Recommendations Service (Python)

**What this service does:** Consumes `ledger.variance.detected` events from the Intelligence service and runs them through a rule-based template engine to produce templated `Recommendation` records. Exposes a CRUD API for surface UIs and emits `recommendations.created` and `recommendations.status_changed` events back onto the bus.

Spec reference: FuzeBox_AEOS_Architecture_Plan_v0_6.docx §6 (Recommendations layer); `docs/architecture/service-map.md` Recommendations row.

---

## Service Boundaries

**Owns:**
- `recommendations` Postgres table — every recommendation, every status transition

**Reads from:**
- Variance events from Kafka (`aeos.{tid}.ledger.ledger.variance.detected`)

**Emits to Event Bus:**
- `recommendations.created` — when a new recommendation is generated
- `recommendations.status_changed` — when an operator transitions a recommendation status

**Consumes from Event Bus:**
- `ledger.variance.detected` — group: `recommendations-variance`

**Does NOT own:**
- LedgerRow / variance source data (Intelligence)
- UoP / Process / Agent records (substrate registries)
- Pattern detection beyond rule matching (v2 — clustering / ML-based candidates)

---

## API Surface

```
GET    /v1/recommendations                — list (filters: status, uop_id, agent_id, category, priority)
GET    /v1/recommendations/:id            — fetch single
PATCH  /v1/recommendations/:id            — update status (open|in_progress|adopted|dismissed)
GET    /healthz
GET    /readyz
```

All endpoints except healthz/readyz use `Depends(get_current_auth)`. Tenant isolation derives from JWT only.

---

## Templated Generation

`src/lib/templates.py` defines a list of `Template` objects. Each has:
- `id` — stable string used as the dedup key
- `matches(payload) -> bool` — predicate over the variance payload
- `build(payload) -> RecommendationCandidate` — concrete recommendation

The dedup rule is "at most one open recommendation per `(tenant_id, template_id, agent_id, uop_id)`" — closed/adopted/dismissed records don't block re-firing later. Enforced by partial unique index in the migration.

Initial templates (subject to product review):
- `severe-underperformance-model-swap` — `negative_underperformance` & ≤ -20% → `model_swap`, high
- `moderate-underperformance-prompt` — `negative_underperformance` & -20% < pct ≤ -10% → `prompt_improvement`, medium
- `data-quality-tool-config` — `data_quality_issue` → `tool_configuration`, high
- `model-drift-oversight` — `model_drift` → `human_oversight_adjustment`, medium
- `positive-overperformance-cost` — `positive_overperformance` & ≥ 25% → `cost_optimization`, low

---

## Multi-Tenant Consumer

`aeos-event-bus-client`'s `AeosConsumer` is tenant-scoped. We instantiate one consumer per tenant id from `SUBSCRIBE_TENANT_IDS` (comma-separated) at startup. Dynamic tenant discovery (querying substrate for active tenants and starting consumers on the fly) is on the v2 backlog.

For local dev: `SUBSCRIBE_TENANT_IDS=<dev-tenant-id>` from `seed-tenant.ts`.

---

## Shared Components

### Auth (`aeos-auth-client`)
Every API endpoint except healthz/readyz uses `Depends(get_current_auth)`.

### Canonical Types (`aeos-canonical-schema`)
- `Recommendation`, `RecommendationCategory`
- Event payloads constructed as plain dicts following the canonical TS shape.

### Event Bus (`aeos-event-bus-client`)
**Produced:**
- `recommendations.created` on `aeos.{tid}.recommendations.recommendations.created`
- `recommendations.status_changed` on `aeos.{tid}.recommendations.recommendations.status_changed`

**Consumed:**
- `ledger.variance.detected` on `aeos.{tid}.ledger.ledger.variance.detected` (group: `recommendations-variance`)

### Registries (`aeos-registry-client`)
Read-only — variance event payload already carries `agent_id`/`uop_id`; we don't need registry lookups in the v1 hot path.

---

## Local Development

```bash
cd services/recommendations
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

cd ../../local-dev && docker-compose up -d

cd ../services/recommendations
alembic upgrade head

# Set SUBSCRIBE_TENANT_IDS to your dev tenant id (from seed-tenant.ts output)
# Then:
uvicorn src.main:app --reload --port 3004
```

Tests:
```bash
pytest tests/unit/
pytest tests/integration/   # requires local stack
```

---

## Database

- Engine: Postgres (asyncpg at runtime, psycopg2 for Alembic)
- Migrations: `alembic/versions/`
- Run: `alembic upgrade head`

**Rules:**
- `tenant_id TEXT NOT NULL` on every row.
- Every query filters by `tenant_id`.
- Open recommendations are dedup'd by `(tenant_id, template_id, agent_id, uop_id)`.

---

## Key Non-Negotiables

- `tenant_id` on every row, cache key, Kafka event.
- v1 observational only — recommendations are surfaced for humans, never auto-applied.
- Auth on every endpoint (except healthz/readyz).
