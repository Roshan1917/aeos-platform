# [SERVICE NAME] Service

**What this service does:** [1-2 sentences. Which AEOS layer. Spec section.]

This is an independently-deployed AEOS platform service. It lives in its own repo and consumes shared platform packages published to the private npm registry.

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

### 1. Configure npm for `@aeos/*` packages

```bash
# Add to ~/.npmrc (or project .npmrc)
@aeos:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Get `GITHUB_TOKEN` from 1Password: **AEOS Dev Secrets → GitHub Packages Token**.

### 2. Install

```bash
pnpm install
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

Option B — use shared dev cluster (ask platform team for kubeconfig): `#aeos-platform`

### 5. Run

```bash
pnpm dev
```

---

## API Surface

All endpoints under `/v1/`. OpenAPI spec: `src/api/openapi.yaml`.

---

## Consuming Shared Packages

### Auth + RBAC — `@aeos/auth-client@^0.1.0`

Every inbound HTTP request must be authenticated. The auth substrate is the identity source for all services.

```typescript
import { requireAuth, requirePermission, checkPermission } from '@aeos/auth-client';

// Wire once at app level — already done in main.ts
app.use(requireAuth());

// req.auth is populated: { userId, tenantId, roles, agentContractId? }

// Per-endpoint permission (throws 403 if denied)
app.get('/v1/ledger', async (req, res) => {
  await requirePermission(req.auth!, 'ledger_row', 'read');
  // ...
});
```

**Permission model for this service:** [resource/action pairs]

Full integration guide:
`https://github.com/fuzebox/aeos-platform/blob/main/docs/guides/consuming-auth.md`

Required env vars:
- `AUTH_JWT_SECRET` — from Secrets Manager path `aeos/{env}/substrate/jwt-secret`
- `AUTH_SERVICE_URL` — URL of the substrate Auth service

**Breaking changes:** `@aeos/auth-client` follows semver. Pin to `^major.minor`. Review changelog before upgrading major versions.

---

### Canonical Types — `@aeos/canonical-schema@^0.1.0`

All shared domain types. Never redefine these locally.

```typescript
import type { LedgerRow, UoP, AeosSpan, TenantId } from '@aeos/canonical-schema';
import { TelemetrySpanReceivedEvent } from '@aeos/canonical-schema/events';
```

**Types used by this service:** [list]

**PATENT WARNING:** `LedgerRow`, `Boundary`, `UoP`, and `Attestation` are patent-adjacent types (USPTO #63/898,712, Patent Families 1, 2, 3, 8). Do not add fields, rename fields, or restructure these types without explicit CTO approval.

Contact: danny.goldstein@fuzebox.ai — do NOT merge any change to these types without his review.

Full schema docs:
`https://github.com/fuzebox/aeos-platform/blob/main/docs/architecture/canonical-data-model.md`

---

### Event Bus — `@aeos/event-bus-client@^0.1.0`

Kafka is the canonical event bus. All events are tenant-scoped. Topic names are handled by the client — never construct them manually.

```typescript
import { createProducer, createConsumer } from '@aeos/event-bus-client';
import type { TelemetrySpanReceivedEvent } from '@aeos/canonical-schema/events';

// Produce
const producer = createProducer({ tenantId: req.auth.tenantId, service: 'my-service' });
await producer.publish({
  event_type: 'telemetry.span.received',
  schema_version: '1.0',
  event_id: crypto.randomUUID(),
  tenant_id: req.auth.tenantId,
  timestamp: new Date().toISOString(),
  payload: span,
} satisfies TelemetrySpanReceivedEvent);
await producer.disconnect(); // on shutdown

// Consume
const consumer = createConsumer({
  tenantId,
  groupId: 'my-service-span-handler',
  service: 'my-service',
});
consumer.on('telemetry.span.received', async (event) => {
  // event.tenant_id, event.payload are fully typed
});
await consumer.start();
await consumer.stop(); // on shutdown
```

**Topics produced:** [list with event types and conditions]
**Topics consumed:** [list with consumer group names]

Full guide:
`https://github.com/fuzebox/aeos-platform/blob/main/docs/guides/consuming-event-bus.md`

Required env vars:
- `KAFKA_BROKERS` — comma-separated MSK broker list
- `KAFKA_SSL=true` in non-local
- `KAFKA_SASL_USERNAME`, `KAFKA_SASL_PASSWORD` — from Secrets Manager

---

### Registries — `@aeos/registry-client@^0.1.0`

Three registries: UoP, Process, Agent. Most services are read-only consumers.

```typescript
import { UoPRegistry, ProcessRegistry, AgentRegistry } from '@aeos/registry-client';

const uopRegistry = new UoPRegistry({ tenantId: req.auth.tenantId, baseUrl: process.env.REGISTRY_URL });
const uop = await uopRegistry.get(uopId);
const processes = await processRegistry.listByUoP(uopId);
```

**Write permissions:** Assessment writes UoPs. Process Discovery writes Processes. Auth/Telemetry register Agents. All other services are read-only.

Full guide:
`https://github.com/fuzebox/aeos-platform/blob/main/docs/guides/consuming-registries.md`

Required env vars: `REGISTRY_URL`

---

### OTEL Telemetry — `@aeos/telemetry-sdk@^0.1.0`

All services emit their own spans. Never use raw `@opentelemetry/api` — use this wrapper so canonical attribute names are enforced.

```typescript
import { initTracing, getTracer, SpanAttributes } from '@aeos/telemetry-sdk';

initTracing('my-service', '1.0.0'); // Call once at startup

const tracer = getTracer('my-service');
const span = tracer.startSpan('handle-request');
span.setAttribute(SpanAttributes.TENANT_ID, tenantId);
span.setAttribute(SpanAttributes.AGENT_ID, agentId);
span.end();
```

Required env vars: `OTEL_EXPORTER_OTLP_ENDPOINT`, `PLATFORM_ENV`

---

## Database

- Engine: RDS Postgres (non-local), Docker Postgres (local)
- Migrations: [tool — Prisma / Drizzle / Flyway]
- Migrations in: `src/db/migrations/`

**Rules:**
1. Every table must have `tenant_id TEXT NOT NULL`.
2. Every query filters by `tenant_id`.
3. Never query across tenants.
4. Never write to another service's DB.

---

## CI/CD

GitHub Actions workflow at `.github/workflows/ci.yml` calls the umbrella's reusable workflow:

```yaml
uses: fuzebox/aeos-platform/.github/workflows/ci-service-template.yml@main
```

This handles: ESLint, TypeScript, Vitest, Docker build, ECR push, Helm validation.

**Deployment:** ArgoCD watches this repo's `main` branch for the non-prod environment. Production requires a release tag (`v*.*.*`) + manual approval in GitHub Environments.

---

## Key Non-Negotiables

1. **`tenant_id` on everything.** Every DB row, cache key, Kafka event. No exceptions.
2. **v1 is observational only.** No runtime intervention in agent execution paths.
3. **`LedgerRow` is append-only.** No `UPDATE` or `DELETE`. Compensating rows only.
4. **Auth on every endpoint.** Except `/healthz` and `/readyz`.
5. **No cross-tenant queries.** Every DB query filters by `tenant_id`.
6. **Patent-adjacent types.** `LedgerRow`, `Boundary`, `UoP`, `Attestation` — CTO approval required for changes.

---

## Contacts & Escalation

| Topic | Contact | Channel |
|---|---|---|
| Platform / shared packages | Platform team | #aeos-platform |
| Architecture questions | Danny Goldstein | @danny |
| Auth / RBAC model | TBD | #aeos-substrate |
| Security | TBD | #aeos-security |
| Patent-adjacent changes | Danny Goldstein | danny.goldstein@fuzebox.ai |
| On-call | TBD | PagerDuty |

When in doubt: ask in `#aeos-platform` before building anything that touches `LedgerRow`, `Boundary`, or `UoP` schema.
