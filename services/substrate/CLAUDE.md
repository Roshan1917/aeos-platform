# Substrate Service (Auth + RBAC + Org Management)

The identity and authorization foundation for the entire AEOS platform. All other services depend on this one being up and stable.

Spec reference: FuzeBox_AEOS_Architecture_Plan_v0_6.docx §2 (Substrate Service layer)

---

## Service Boundaries

**Owns:**
- Tenant records and settings
- User accounts and sessions
- RBAC roles, permissions, and policy objects (OpenFGA)
- Agent identity records and contracts
- Signing service (LedgerRow + Attestation co-signatures)

**Reads from:**
- Nothing — this is the identity source; all other services read from it

**Emits to Event Bus:**
- `registry.agent.registered` — when a new Agent is created
- `registry.uop.registered` — proxies from Assessment (substrate hosts the registry APIs)
- `registry.process.registered` — proxies from Process Discovery

**Consumes from Event Bus:**
- None — substrate is read-only from the bus perspective

**Does NOT own:**
- LedgerRow data (owned by Intelligence)
- Telemetry spans (owned by Telemetry service)
- Policy pack definitions (owned by Governance, but substrate enforces them via OpenFGA)
- Business process definitions (owned by Process Discovery, but substrate stores the registry)

---

## API Surface

```
POST /v1/auth/token               ← issues JWT from credentials
POST /v1/auth/refresh             ← refreshes JWT
POST /v1/tenants                  ← creates a tenant (admin only)
GET  /v1/tenants/:id
GET  /v1/tenants/:id/settings
PATCH /v1/tenants/:id/settings

POST /v1/users                    ← creates a user within a tenant
GET  /v1/users/:id
GET  /v1/users                    ← list users in caller's tenant

POST /v1/rbac/check               ← OpenFGA permission check (used by @aeos/auth-client)
POST /v1/rbac/write               ← write relationship tuples (admin only)

GET  /v1/agents                   ← list agents in tenant
POST /v1/agents                   ← register new agent (used by SDK adapters)
GET  /v1/agents/:id
POST /v1/agent-contracts          ← create agent contract
GET  /v1/agent-contracts/:id
POST /v1/agent-contracts/:id/verify ← verify agent identity (used by @aeos/auth-client)

# Registry APIs (proxied here; events emitted to Kafka)
GET  /v1/tenants/:id/uops         ← served from Registry DB
POST /v1/tenants/:id/uops         ← Assessment only
POST /v1/tenants/:id/uops/import  ← bulk JSON import (admin/platform_admin); duplicate names skipped
GET  /v1/tenants/:id/processes
POST /v1/tenants/:id/processes    ← Process Discovery only
GET  /v1/tenants/:id/agents       ← read-only for most services

# Signing service (internal — not exposed externally)
POST /internal/sign/ledger-row    ← sign LedgerRow hash with FuzeBox key
POST /internal/sign/attestation   ← sign AttestationBundle hash
```

---

## Shared Components

### This service IS the Auth service

Other services call `@aeos/auth-client` which calls this service's endpoints. This service does NOT use `@aeos/auth-client` for inbound auth (it is the source).

It does use JWT validation for admin-level calls (super-admin token from the platform bootstrap).

### Canonical Types Used

```typescript
import type {
  Tenant, TenantSettings,
  Agent, AgentContract,
  UoP, Process,
} from '@aeos/canonical-schema';
```

**PATENT NOTE:** `AgentContract` and `UoP` are patent-adjacent. Schema changes require CTO approval.

### Event Bus (produces only)

```typescript
import { createProducer } from '@aeos/event-bus-client';

const producer = createProducer({ tenantId, service: 'substrate' });
await producer.publish({
  event_type: 'registry.agent.registered',
  ...
} satisfies AgentRegisteredEvent);
```

---

## Local Development

```bash
cd services/substrate
cp .env.example .env
pnpm dev
# Service starts on :3002
```

The substrate service is required before running seed scripts.

---

## Database

- Engine: Postgres (`aeos_substrate` DB)
- ORM: Prisma 5
- Schema: tenants, users, sessions, agents, agent_contracts, uops, processes, rbac_audit_log
- Migrations: `prisma/migrations/` — `pnpm prisma migrate dev` (local) / `npx prisma migrate deploy` (cluster, runs as initContainer in the substrate Helm chart)

**Rules:**
- `tenant_id` on all rows except the `tenants` table itself
- `uops` and `processes` tables are multi-tenant (substrate hosts the registry)
- Never allow cross-tenant reads in any query

---

## RBAC (OpenFGA)

Authorization model: Relationship-Based Access Control (ReBAC) via OpenFGA.

Object types: `tenant`, `user`, `agent`, `uop`, `ledger_row`, `recommendation`, `attestation`, `report`

Standard relations: `reader`, `writer`, `admin`, `owner`

On tenant creation: bootstrap the admin user as `owner` of the tenant via `POST /v1/rbac/write` (the seed scripts do this; manual call also works once you have a platform-admin JWT).

**Wiring:** substrate reads `OPENFGA_API_URL`, `OPENFGA_STORE_ID`, `OPENFGA_MODEL_ID` from env (sourced from the `aeos/{env}/substrate` Secrets Manager entry in non-prod/prod, `.env` locally). Store + model are created out-of-band: `local-dev/seed/seed-openfga.ts` for local, manual `fga store create` + `fga model write` for non-prod (one-time per env — see [infra/CLAUDE.md](../../infra/CLAUDE.md) "Post-apply manual steps"). OpenFGA itself runs in-memory in non-prod (`datastore.engine=memory` in the Helm release); switch to Postgres backend for prod.

---

## Graduation Target

Day 30 — substrate graduates to its own repo once the API contract is stable and other services have successfully integrated against it.
