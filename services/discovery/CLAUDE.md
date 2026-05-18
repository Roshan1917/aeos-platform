# Discovery Service (Process Auto-Discovery)

**What this service does:** LLM-driven discovery of business processes from
uploaded documents. A user creates a `document_only` connector, uploads
SOPs / playbooks / spreadsheets, and triggers a run; Claude analyzes the
documents (with an interactive `ask_user` interview loop), then proposes
process suggestions with automation scoring. On apply, the suggestion is
registered as a canonical `Process` in substrate.

Spec reference: FuzeBox AEOS — Process Discovery (one of the six
differentiated services).

Ported from `fuzebox-intelligence/discovery-service`. AI agents
(`process-discovery`, `refinement`, `automation-scoring`,
`automation-analysis`) and the document converter are copied near-verbatim;
the HTTP, DB, and auth layers are rewritten on the aeos-platform stack
(Express + Prisma + `@aeos/auth-client`).

---

## Service Boundaries

**Owns:**
- `discovery_connectors`, `discovery_runs`, `discovery_suggestions`
  (Postgres `discovery` schema)
- Uploaded documents on disk under `DOCUMENT_STORAGE_PATH`
- Interactive agent state in Redis (24h TTL)

**Reads from:**
- Substrate (`POST /v1/tenants/:id/processes`) — to register canonical
  `Process` on suggestion apply

**Emits to Event Bus:**
- None directly. Substrate emits `registry.process.registered` on the
  registry write triggered by apply.

**Consumes from Event Bus:**
- None.

**Does NOT own:**
- Canonical `Process` records (substrate)
- UoP / Agent registry
- Span ingestion (telemetry)
- Non-document connectors (HubSpot, Salesforce, Datadog, MCP — deferred)

---

## API Surface

All endpoints under `/v1/discovery`. Auth required on every endpoint
except `/healthz`, `/readyz` — tenant_id read from JWT only.

```
POST   /v1/discovery/connectors                      — create document_only connector
GET    /v1/discovery/connectors
GET    /v1/discovery/connectors/:id
PATCH  /v1/discovery/connectors/:id
DELETE /v1/discovery/connectors/:id

POST   /v1/discovery/connectors/:id/documents        — multipart upload (PDF/DOCX/XLSX/TXT/CSV/JPG/PNG)
GET    /v1/discovery/connectors/:id/documents
DELETE /v1/discovery/connectors/:id/documents/:filename

POST   /v1/discovery/connectors/:id/run              — fire-and-forget; returns run id
GET    /v1/discovery/runs/:runId                     — status + ephemeral progress
POST   /v1/discovery/runs/:runId/answer              — answer interactive question(s)
POST   /v1/discovery/runs/:runId/skip                — skip remaining questions

GET    /v1/discovery/runs/:runId/suggestions
PATCH  /v1/discovery/suggestions/:id                 — status / proposed_steps
POST   /v1/discovery/suggestions/:id/refine          — LLM refinement
POST   /v1/discovery/suggestions/:id/questions       — analysis Q-gen
POST   /v1/discovery/suggestions/:id/analyze         — analysis run
POST   /v1/discovery/suggestions/:id/apply           — register Process in substrate
                                                       body: { uop_id }

GET    /healthz, /readyz                             — no auth
```

---

## Local Development

```bash
cd services/discovery
cp .env.example .env             # set ANTHROPIC_API_KEY
pnpm install
pnpm db:migrate:dev              # creates discovery schema tables
pnpm dev                         # :3006
```

Or via the full local stack:

```bash
cd local-dev
docker-compose --profile services up -d
docker-compose logs -f discovery
```

---

## Database

- Engine: Postgres (`aeos` DB, `discovery` schema)
- ORM: Prisma 5
- Migrations: `prisma/migrations/`
- Three tables — connectors, runs, suggestions. Every row has
  `tenant_id NOT NULL`.

---

## Key Non-Negotiables

- `tenant_id` from JWT only — never from request bodies, query params, or
  path params.
- Auth on every endpoint except `/healthz`, `/readyz`.
- `LedgerRow` is not touched by this service.
- v1 supports `document_only` connector only. Adding new connector types
  requires reintroducing config encryption (see source service for the
  AES-256-GCM pattern in `shared/crypto.ts`).
- Apply hands the canonical Process write to substrate — discovery
  never writes to substrate's tables and never emits
  `registry.process.registered` itself (substrate emits on write to
  avoid duplicate events).
