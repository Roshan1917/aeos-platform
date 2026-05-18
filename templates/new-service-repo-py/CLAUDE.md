# [SERVICE NAME] Service (Python)

**What this service does:** [1-2 sentences. Which AEOS layer. Spec section.]

This is an independently-deployed AEOS platform service (Python/FastAPI). It lives in its own repo and consumes shared platform packages from the private PyPI registry.

**Platform umbrella:** `github.com/fuzebox/aeos-platform`
**Package docs:** `https://github.com/fuzebox/aeos-platform/tree/main/packages`
**Architecture docs:** `https://github.com/fuzebox/aeos-platform/tree/main/docs/architecture`

---

## Service Boundaries

**Owns:** [data/state in this service's DB]
**Reads from:** [services / registries / packages]
**Emits to Event Bus:** [canonical event types produced]
**Consumes from Event Bus:** [canonical event types consumed, group IDs]
**Does NOT own:** [explicit exclusions]

---

## First-Time Setup

### 1. Configure pip for `aeos-*` packages

```bash
# pip.conf or ~/.pip/pip.conf
[global]
extra-index-url = https://__token__:${AEOS_PYPI_TOKEN}@AEOS_PYPI_URL/simple/
```

Get `AEOS_PYPI_TOKEN` and `AEOS_PYPI_URL` from 1Password: **AEOS Dev Secrets → PyPI Token**.

### 2. Install

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```

### 3. Configure env

```bash
cp .env.example .env
# Edit .env — get secret values from 1Password: AEOS Dev Secrets
```

### 4. Start local AEOS stack

Option A — run locally:
```bash
git clone git@github.com:fuzebox/aeos-platform.git /tmp/aeos-platform
cd /tmp/aeos-platform/local-dev
cp .env.example .env
docker-compose up -d
./seed/kafka-topics.sh
pnpm tsx seed/seed-tenant.ts
pnpm tsx seed/seed-registries.ts
```

Option B — use shared dev cluster: `#aeos-platform` on Slack.

### 5. Run

```bash
uvicorn src.main:app --reload --port 3000
```

---

## API Surface

All endpoints under `/v1/`. Swagger UI at `/docs` (local only).

---

## Consuming Shared Packages

### Auth + RBAC — `aeos-auth-client>=0.1.0`

Every inbound HTTP request must be authenticated.

```python
from typing import Annotated
from fastapi import Depends
from aeos_auth_client import get_current_auth, require_permission
from aeos_auth_client.types import AuthContext

@app.get("/v1/resource")
async def get_resource(auth: Annotated[AuthContext, Depends(get_current_auth)]):
    await require_permission(auth, "resource", "read")
    # auth.tenant_id, auth.user_id, auth.roles available
    tenant_id = auth.tenant_id
    ...
```

**Permission model:** [resource/action pairs this service checks]

Full guide:
`https://github.com/fuzebox/aeos-platform/blob/main/docs/guides/consuming-auth.md`

Required env vars:
- `AUTH_JWT_SECRET` — from Secrets Manager `aeos/{env}/substrate/jwt-secret`
- `AUTH_SERVICE_URL` — URL of the substrate Auth service

---

### Canonical Types — `aeos-canonical-schema>=0.1.0`

All shared domain types. Never redefine locally. TypeScript is the source of truth; Python types are auto-generated.

```python
from aeos_canonical_schema import LedgerRow, UoP, AeosSpan, Tenant
from aeos_canonical_schema.types import PredictedPayload, VarianceBucket
```

**Types used:** [list]

**PATENT WARNING:** `LedgerRow`, `Boundary`, `UoP`, `Attestation` are patent-adjacent (USPTO #63/898,712). Do not modify fields without CTO approval.

Contact: danny.goldstein@fuzebox.ai

Full schema docs:
`https://github.com/fuzebox/aeos-platform/blob/main/docs/architecture/canonical-data-model.md`

---

### Event Bus — `aeos-event-bus-client>=0.1.0`

Kafka, tenant-scoped. Never construct topic names manually.

```python
from aeos_event_bus_client import create_producer, create_consumer

# Produce
producer = create_producer(tenant_id=auth.tenant_id, service="my-service")
await producer.publish(TelemetrySpanReceivedEvent(
    event_id=str(uuid4()),
    tenant_id=auth.tenant_id,
    timestamp=datetime.utcnow().isoformat(),
    payload=span,
))

# Consume
consumer = create_consumer(
    tenant_id=tenant_id,
    group_id="my-service-handler",
    service="my-service",
)
consumer.on("telemetry.span.received", handle_span)
await consumer.start()
```

**Topics produced:** [list]
**Topics consumed:** [list with group IDs]

Full guide:
`https://github.com/fuzebox/aeos-platform/blob/main/docs/guides/consuming-event-bus.md`

Required env vars: `KAFKA_BROKERS`, `KAFKA_SSL`, `KAFKA_SASL_USERNAME`, `KAFKA_SASL_PASSWORD`

---

### Registries — `aeos-registry-client>=0.1.0`

```python
from aeos_registry_client import UoPRegistry, ProcessRegistry, AgentRegistry

uop_registry = UoPRegistry(tenant_id=auth.tenant_id, base_url=config.REGISTRY_URL)
uop = await uop_registry.get(uop_id)
processes = await process_registry.list_by_uop(uop_id)
```

**Write permissions:** Assessment only writes UoPs. Process Discovery only writes Processes.

Required env vars: `REGISTRY_URL`

---

### OTEL Telemetry — `aeos-telemetry-sdk>=0.1.0`

```python
from aeos_telemetry_sdk import init_tracing, get_tracer, SpanAttributes

init_tracing("my-service", "1.0.0")  # call once at startup

tracer = get_tracer("my-service")
with tracer.start_as_current_span("handle-request") as span:
    span.set_attribute(SpanAttributes.TENANT_ID, tenant_id)
    span.set_attribute(SpanAttributes.INPUT_TOKENS, 1200)
```

Required env vars: `OTEL_EXPORTER_OTLP_ENDPOINT`, `PLATFORM_ENV`

---

## Database

- Engine: Postgres with asyncpg
- Migrations: Alembic (`alembic/`)
- Run: `alembic upgrade head`

**Rules:**
1. Every table has `tenant_id TEXT NOT NULL`.
2. Every query has `WHERE tenant_id = :tenant_id`.
3. Never query across tenants.
4. Never write to another service's DB.

---

## CI/CD

`.github/workflows/ci.yml` calls the umbrella's reusable workflow:
```yaml
uses: fuzebox/aeos-platform/.github/workflows/ci-service-template.yml@main
```

Handles: ruff, mypy, pytest, Docker build, ECR push, Helm validation.

Deployment: ArgoCD watches `main` for non-prod. Production requires release tag + manual approval.

---

## Key Non-Negotiables

1. **`tenant_id` on everything.** Every DB row, cache key, Kafka event.
2. **v1 observational only.** No runtime agent intervention.
3. **`LedgerRow` append-only.** No UPDATE/DELETE.
4. **Auth on every endpoint** (except `/healthz`, `/readyz`).
5. **No cross-tenant queries.**
6. **Patent types need CTO approval.** `LedgerRow`, `Boundary`, `UoP`, `Attestation`.

---

## Contacts & Escalation

| Topic | Contact | Channel |
|---|---|---|
| Platform / shared packages | Platform team | #aeos-platform |
| Architecture | Danny Goldstein | @danny |
| Auth / RBAC | TBD | #aeos-substrate |
| Patent-adjacent changes | Danny Goldstein | danny.goldstein@fuzebox.ai |
| On-call | TBD | PagerDuty |
