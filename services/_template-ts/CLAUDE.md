# [SERVICE NAME] Service

> **STOP — this is a scaffold, not a real service.**
> If you are reading this from `services/_template-ts/`, do **not** edit in place.
> Copy the folder first: `cp -r services/_template-ts services/<your-service>`, then edit there.
> See [docs/guides/new-service-in-repo.md](../../docs/guides/new-service-in-repo.md).

**What this service does:** [1-2 sentences. Which AEOS layer. What spec section covers it.]

Spec reference: [FuzeBox_AEOS_Architecture_Plan_v0_6.docx §X / AEOS_Functional_Technical_Requirements_v1.1.docx §X]

---

## Service Boundaries

**Owns:**
- [What data/state lives in this service's DB]

**Reads from:**
- [Other services / registries / packages]

**Emits to Event Bus:**
- [Canonical event types this service produces, e.g. `telemetry.span.received`]

**Consumes from Event Bus:**
- [Canonical event types this service subscribes to, consumer group name]

**Does NOT own:**
- [Explicit exclusions — prevents scope creep]

---

## API Surface

All endpoints are under `/v1/`. Full spec: `src/api/openapi.yaml`.

| Method | Path | Description |
|---|---|---|
| GET | /v1/... | [placeholder — fill in] |

---

## Shared Components

### Auth + RBAC (`@aeos/auth-client`)

Every endpoint except `/healthz` and `/readyz` requires auth.

```typescript
import { requireAuth, requirePermission } from '@aeos/auth-client';

// Applied at app level in main.ts — already wired in template
app.use(requireAuth());

// req.auth.tenantId, req.auth.userId, req.auth.roles available in all handlers

// Per-endpoint permission check
app.get('/v1/resource', async (req, res) => {
  await requirePermission(req.auth!, 'resource', 'read');
  // ... handler
});
```

**Permission model for this service:** [describe the resource/action pairs]

Full guide: [../../docs/guides/consuming-auth.md](../../docs/guides/consuming-auth.md)
Env vars required: `AUTH_JWT_SECRET`, `AUTH_SERVICE_URL`

### Canonical Types (`@aeos/canonical-schema`)

```typescript
import type { LedgerRow, UoP, AeosSpan } from '@aeos/canonical-schema';
```

**Types used:** [list the canonical types this service imports]

**PATENT NOTE:** Do not add fields to `LedgerRow`, `Boundary`, `UoP`, or `Attestation` without CTO approval (danny.goldstein@fuzebox.ai).

Full docs: [../../docs/architecture/canonical-data-model.md](../../docs/architecture/canonical-data-model.md)

### Event Bus (`@aeos/event-bus-client`)

```typescript
import { createProducer, createConsumer } from '@aeos/event-bus-client';

// Produce
const producer = createProducer({ tenantId: req.auth.tenantId, service: 'REPLACE_ME' });
await producer.publish({ event_type: 'telemetry.span.received', ... });

// Consume
const consumer = createConsumer({ tenantId, groupId: 'REPLACE_ME-handler', service: 'REPLACE_ME' });
consumer.on('ledger.row.written', async (event) => { ... });
await consumer.start();
```

**Topics produced:** [list with conditions]
**Topics consumed:** [list with consumer group names]

Full guide: [../../docs/guides/consuming-event-bus.md](../../docs/guides/consuming-event-bus.md)
Env vars required: `KAFKA_BROKERS`, `KAFKA_SSL`, `KAFKA_SASL_USERNAME`, `KAFKA_SASL_PASSWORD`

### Registries (`@aeos/registry-client`)

```typescript
import { UoPRegistry, AgentRegistry } from '@aeos/registry-client';

const uopRegistry = new UoPRegistry({ tenantId: req.auth.tenantId, baseUrl: config.REGISTRY_URL });
const uop = await uopRegistry.get(uopId);
```

**Registries used:** [UoP / Process / Agent — read or write]
**Write permission:** Only Assessment writes UoPs; only Process Discovery writes Processes. See registry write policy.

Full guide: [../../docs/guides/consuming-registries.md](../../docs/guides/consuming-registries.md)
Env vars required: `REGISTRY_URL`

---

## Local Development

```bash
cd services/REPLACE_ME
cp .env.example .env
# Edit .env if needed (see local-dev/.env.example for running stack values)

# Start local deps first
cd ../../local-dev && docker-compose up -d

# Run in watch mode
pnpm dev
```

Tests:
```bash
pnpm test                # unit tests
pnpm test:integration    # requires local stack running
```

---

## Database

- Engine: Postgres (RDS in non-local, Docker in local)
- Migrations: [tool — Prisma / Flyway / Drizzle]
- Migrations live in: `src/db/migrations/`
- Run migrations: `pnpm db:migrate`

**Rules:**
- Every table must have `tenant_id TEXT NOT NULL` as a non-nullable column.
- Never query without a `WHERE tenant_id = $1` clause.
- Never write to another service's tables.

---

## Deployment

Kubernetes namespace: `differentiated` (or `substrate` for the Auth service)
Helm chart: `helm/`
K8s labels: `aeos.fuzebox/service: REPLACE_ME`

Secrets injected via External Secrets Operator from AWS Secrets Manager:
`aeos/{env}/REPLACE_ME/...`

---

## Key Non-Negotiables

- `tenant_id` on every DB row, every cache key, every Kafka event.
- v1 is observational only. No runtime intervention in agent execution paths.
- `LedgerRow` is append-only — no UPDATE or DELETE ever.
- Auth on every endpoint (except `/healthz`, `/readyz`).
