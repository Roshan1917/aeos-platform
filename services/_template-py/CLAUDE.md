# [SERVICE NAME] Service (Python)

> **STOP — this is a scaffold, not a real service.**
> If you are reading this from `services/_template-py/`, do **not** edit in place.
> Copy the folder first: `cp -r services/_template-py services/<your-service>`, then edit there.
> See [docs/guides/new-service-in-repo.md](../../docs/guides/new-service-in-repo.md).

**What this service does:** [1-2 sentences. Which AEOS layer. What spec section covers it.]

Spec reference: [FuzeBox_AEOS_Architecture_Plan_v0_6.docx §X]

---

## Service Boundaries

**Owns:** [data/state in this service's DB]
**Reads from:** [other services / registries / packages]
**Emits to Event Bus:** [event types produced]
**Consumes from Event Bus:** [event types consumed, consumer group name]
**Does NOT own:** [explicit exclusions]

---

## API Surface

All endpoints under `/v1/`. Swagger docs at `/docs` (local only).

---

## Shared Components

### Auth + RBAC (`aeos-auth-client`)

```python
from typing import Annotated
from fastapi import Depends
from aeos_auth_client import get_current_auth, require_permission
from aeos_auth_client.types import AuthContext

@app.get("/v1/resource")
async def get_resource(auth: Annotated[AuthContext, Depends(get_current_auth)]):
    await require_permission(auth, "resource", "read")
    # auth.tenant_id, auth.user_id, auth.roles available
    ...
```

**Permission model:** [resource/action pairs this service checks]

Full guide: [../../docs/guides/consuming-auth.md](../../docs/guides/consuming-auth.md)
Env vars: `AUTH_JWT_SECRET`, `AUTH_SERVICE_URL`

### Canonical Types (`aeos-canonical-schema`)

```python
from aeos_canonical_schema import LedgerRow, UoP, AeosSpan
from aeos_canonical_schema.types import PredictedPayload
```

**Types used:** [list canonical types this service imports]

**PATENT NOTE:** Do not modify `LedgerRow`, `Boundary`, `UoP`, `Attestation` fields without CTO approval (danny.goldstein@fuzebox.ai).

### Event Bus (`aeos-event-bus-client`)

```python
from aeos_event_bus_client import create_producer, create_consumer

producer = create_producer(tenant_id=auth.tenant_id, service="REPLACE_ME")
await producer.publish(TelemetrySpanReceivedEvent(...))

consumer = create_consumer(
    tenant_id=tenant_id,
    group_id="REPLACE_ME-handler",
    service="REPLACE_ME",
)
consumer.on("telemetry.span.received", handle_span)
await consumer.start()
```

**Topics produced:** [list]
**Topics consumed:** [list with group IDs]

Full guide: [../../docs/guides/consuming-event-bus.md](../../docs/guides/consuming-event-bus.md)
Env vars: `KAFKA_BROKERS`, `KAFKA_SSL`, `KAFKA_SASL_USERNAME`, `KAFKA_SASL_PASSWORD`

### Registries (`aeos-registry-client`)

```python
from aeos_registry_client import UoPRegistry

uop_registry = UoPRegistry(tenant_id=auth.tenant_id, base_url=config.REGISTRY_URL)
uop = await uop_registry.get(uop_id)
```

Env vars: `REGISTRY_URL`

---

## Local Development

```bash
cd services/REPLACE_ME
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

# Start local deps
cd ../../local-dev && docker-compose up -d

# Run
uvicorn src.main:app --reload --port 3000
```

Tests:
```bash
pytest tests/unit/
pytest tests/integration/  # requires local stack
```

---

## Database

- Engine: Postgres (asyncpg driver)
- Migrations: Alembic (`alembic/`)
- Run migrations: `alembic upgrade head`

**Rules:**
- Every table has `tenant_id TEXT NOT NULL`.
- Every query filters by `tenant_id`.
- Never write to another service's tables.

---

## Key Non-Negotiables

- `tenant_id` on every row, cache key, Kafka event.
- v1 observational only — no runtime agent intervention.
- `LedgerRow` append-only.
- Auth on every endpoint (except `/healthz`, `/readyz`).
