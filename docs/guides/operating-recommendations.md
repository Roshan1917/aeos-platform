# Operating the Recommendations Service

Audience: on-call and platform engineers running the AEOS Recommendations service.

Service location: `services/recommendations/` (Python, FastAPI). Source of truth: [services/recommendations/CLAUDE.md](../../services/recommendations/CLAUDE.md).

---

## Data Flow at a Glance

```
Intelligence
    │
    ▼  ledger.variance.detected
Recommendations Consumer
    ├─ candidates_for(payload) → list[Template match]
    ├─ INSERT INTO recommendations (open dedup per template+agent+uop)
    └─ Publish recommendations.created → Kafka

PATCH /v1/recommendations/:id
    ├─ UPDATE recommendations SET status = ...
    └─ Publish recommendations.status_changed → Kafka
```

---

## Healthchecks

- `GET /healthz` — always 200
- `GET /readyz` — 503 until DB pool initialised + consumers started

---

## Common Operations

### Bring up locally

```bash
cd local-dev && docker-compose up -d
cd ../services/recommendations
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

# Set SUBSCRIBE_TENANT_IDS to the tenant id created by seed-tenant.ts:
echo "SUBSCRIBE_TENANT_IDS=<tenant-id>" >> .env

alembic upgrade head
uvicorn src.main:app --reload --port 3004
```

### Smoke test variance → recommendation

In a Python shell with KAFKA_BROKERS=localhost:9092 set:

```python
import asyncio, uuid
from datetime import datetime, timezone
from aeos_event_bus_client import create_producer

async def main():
    p = create_producer(tenant_id="<tenant-id>", service="manual-test")
    await p.publish({
        "event_type": "ledger.variance.detected",
        "schema_version": "1.0",
        "event_id": str(uuid.uuid4()),
        "tenant_id": "<tenant-id>",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": {
            "variance_row_id": "var-test",
            "uop_id": "<uop-id>",
            "agent_id": "<agent-id>",
            "variance_bucket": "negative_underperformance",
            "variance_pct": -25.0,
        },
    })
    await p.disconnect()

asyncio.run(main())
```

Then:

```bash
curl -H "Authorization: Bearer $JWT" http://localhost:3004/v1/recommendations
```

Expect to see a recommendation with `template_id=severe-underperformance-model-swap`, `priority=high`.

### Inspect stored recommendations

```bash
psql $RECOMMENDATIONS_DATABASE_URL -c "
  SELECT id, template_id, status, priority, agent_id, uop_id, created_at
  FROM recommendations
  ORDER BY created_at DESC LIMIT 20"
```

### Verify Kafka emission

```bash
kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic aeos.<tenant-id>.recommendations.recommendations.created \
  --from-beginning --max-messages 10
```

---

## Failure Modes & Triage

| Symptom | Likely Cause | First Move |
|---|---|---|
| Service starts but no recs are produced | `SUBSCRIBE_TENANT_IDS` empty | Set the env var to comma-separated active tenant ids |
| Variance event arrives but no rec | No template matched the bucket/pct | Check `src/lib/templates.py` — `candidates_for(payload)` returns `[]` |
| Variance arrives, template matches, but no rec inserted | Open recommendation already exists for `(tenant, template, agent, uop)` | Mark the existing rec adopted/dismissed; future variance events will refire |
| 401 on PATCH | Missing/invalid JWT | Re-issue token; verify `AUTH_JWT_SECRET` matches substrate |
| `db_insert_failed` | Postgres unreachable / migration not applied | Run `alembic upgrade head` |
| Kafka emit failed but DB transition succeeded | Kafka unavailable | Out-of-band replay reads from `recommendations` table; full replay tooling on Phase 14 backlog |

---

## Adding a New Template

1. Add a `Template` entry to `src/lib/templates.py`.
2. Choose a stable `id` — it's the dedup key. Don't reuse an existing id for a different rule.
3. Add a unit test in `tests/unit/test_templates.py` covering the matching predicate boundaries.
4. Open a PR; product/CTO review before adding any template that could block sensitive workflows.

---

## Notes

- Open dedup is per `(tenant_id, template_id, agent_id, uop_id)` enforced by partial unique index `recommendations_open_dedup_uidx`.
- Status transitions are not append-only (we mutate the row's `status` and `updated_at`). Audit history will live on a separate `recommendations_audit` table when product asks for it; out of scope for v1.
