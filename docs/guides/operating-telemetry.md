# Operating the Telemetry Service

Audience: on-call and platform engineers running the AEOS Telemetry service in non-prod and prod.

Service location: `services/telemetry/` (Python, FastAPI). Source of truth: [services/telemetry/CLAUDE.md](../../services/telemetry/CLAUDE.md).

---

## Data Flow at a Glance

```
Adapter SDK / Sidecar Collector
        │
        ▼  POST /v1/spans  (JSON body: { spans: AeosSpan[] })
Telemetry Service
        ├─ classify(name) → SpanKind
        ├─ enrich uop_id → process_id (30s cache)
        ├─ INSERT INTO spans (idempotent on tenant_id, span_id)
        ├─ Mirror to LangFuse (best-effort)
        └─ Publish telemetry.span.enriched to Kafka
```

`span.enriched` consumers: Intelligence service.

Spans without `uop_id` are stored locally for query but not emitted to Kafka — the canonical event contract requires `uop_id` and `process_id`.

---

## Healthchecks

- `GET /healthz` — always 200; for liveness probes.
- `GET /readyz` — 503 until DB pool, LangFuse client, and lifespan setup complete; for readiness probes.

---

## Common Operations

### Bring up locally

```bash
cd local-dev && docker-compose up -d
cd ../services/telemetry
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head
uvicorn src.main:app --reload --port 3003
```

### Smoke test

```bash
pnpm tsx local-dev/seed/seed-spans.ts
```

Expect HTTP 202 with per-span `accepted: true, inserted: true, process_id: <uuid>`.

### Inspect stored spans

```bash
psql $TELEMETRY_DATABASE_URL -c "SELECT span_id, kind, agent_id, uop_id, process_id, ingested_at FROM spans ORDER BY ingested_at DESC LIMIT 20"
```

### Verify Kafka emission

```bash
kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic aeos.<tenant-id>.telemetry.telemetry.span.enriched \
  --from-beginning --max-messages 10
```

(The duplicate `telemetry.telemetry.` is intentional — the `topicName` helper prepends domain + full event_type.)

---

## Failure Modes & Triage

| Symptom | Likely Cause | First Move |
|---|---|---|
| `error: tenant_mismatch` per span | Caller's JWT tenant ≠ span body tenant_id | Correct caller. Server is enforcing isolation. |
| `error: enrichment_failed` | Substrate registry unreachable | Check substrate `/healthz`, `REGISTRY_URL` env, network ACLs |
| `error: db_insert_failed` | Postgres unreachable or schema drift | Check `DATABASE_URL`, run `alembic upgrade head` |
| `error: kafka_emit_failed` | Kafka brokers unreachable / SASL bad creds | Check `KAFKA_BROKERS` and credentials. DB write already succeeded — replay possible. |
| Span stored but no Kafka event | `uop_id` missing on the span | Backfill UoP via Process Discovery, then re-POST the span |
| LangFuse UI shows no traces | Mirror disabled or LangFuse keys invalid | Set `LANGFUSE_ENABLED=true` and verify `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` |
| High `unresolved_process_id` | UoP exists but no active Process | Run Process Discovery to map; cache will refresh in 30s |

---

## Replay / Reconciliation

If Kafka emission fails after a successful DB insert, the canonical event was lost while the span row was kept. To replay:

```sql
SELECT span_id, tenant_id, trace_id, agent_id, uop_id, process_id, kind,
       start_time, end_time, duration_ms, status, attributes, events,
       enrichment_version
FROM spans
WHERE ingested_at >= now() - interval '15 minutes'
  AND uop_id IS NOT NULL AND process_id IS NOT NULL
  AND tenant_id = '<tenant>';
```

…then craft `telemetry.span.enriched` events from those rows and re-publish via the event-bus-client. A dedicated replay tool is on the Phase 13 backlog.

---

## Capacity Notes

- DB indexes assume queries by `(tenant_id, trace_id)`, `(tenant_id, agent_id)`, `(tenant_id, kind, start_time DESC)`. Other access patterns should add indexes before going wide.
- Enrichment cache is per-process. Horizontal scaling is fine; cache TTL bounds staleness at 30s.
- Producers are pooled per tenant; high-tenant-fanout deployments may want to bound the producer count or per-tenant publish rate.

---

## Reference Implementation

Patterns transplanted from the AITT POC at `/Users/fernandogoldstein/fuzebox/fuzebox-intelligence`:

- Idempotent ingestion via `(collector_id, event_id)` UNIQUE INDEX → here as `(tenant_id, span_id)`
- 30s mapping cache → `lib/enricher.py`
- Agent discovery from inbound spans → `lib/agent_discovery.py`
- Cowork OTEL skill detection → ported as a separate SDK adapter at `sdk/adapters/cowork/`
