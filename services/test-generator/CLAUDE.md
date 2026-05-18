# Test-Case Generator Service

**What this service does:** LLM-driven generator + executor for synthetic AEOS agent traces. Internal QA tool. A tester describes a scenario in natural language; Claude returns a structured `TestCase` plan (mix of `llm_call`, `tool_call`, `human_handoff`, `agent_decision` steps); the executor turns the plan into spans and POSTs them to the Telemetry service so they show up in the platform end-to-end.

Internal-only — not customer-facing. Lives behind the standard tenant JWT.

---

## Service Boundaries

**Owns:**
- `test_cases` Postgres table (`aeos_test_generator` DB) — saved scenario plans, tenant-scoped

**Reads from:**
- Substrate (`/v1/tenants/:id/agents`, `/v1/tenants/:id/uops`) — to resolve a real `agent_id` / `uop_id` at execute time

**Writes to (HTTP):**
- Telemetry (`POST /v1/spans`) — synthetic + live span batches

**Calls (external):**
- Anthropic Messages API — for `/v1/test-cases/generate` and live-mode `llm_call` steps

**Emits to Event Bus:** none

**Consumes from Event Bus:** none

**Does NOT own:**
- Spans / traces (Telemetry service)
- Agent registry (Substrate)
- Real tool runtimes — tool_call steps are always synthetic

---

## API Surface

```
POST   /v1/test-cases/generate           — Claude → TestCasePlan JSON (no DB write)
POST   /v1/test-cases                    — save a plan
GET    /v1/test-cases                    — list (caller's tenant)
GET    /v1/test-cases/:id
DELETE /v1/test-cases/:id

POST   /v1/test-cases/:id/execute        — start a run, returns { run_id }
GET    /v1/runs/:run_id                  — current run state + history
GET    /v1/runs/:run_id/events           — SSE stream
POST   /v1/runs/:run_id/decisions        — supply human approve/reject (interactive mode)

GET    /healthz, /readyz                 — no auth
```

Everything except the health endpoints requires a substrate-issued JWT. Tenant id is taken from the JWT only.

---

## Execution modes

| `mode`    | Behaviour |
|-----------|-----------|
| synthetic | All spans are fabricated from the plan's declared values. Cheap, deterministic. |
| live      | `llm_call` steps run against the real Anthropic API; tokens / cost / duration come from the actual response. Other step kinds stay synthetic. Costs money. |

| `human_mode` | Behaviour |
|--------------|-----------|
| auto         | `human_handoff` steps emit immediately using the plan's `expected_decision`. |
| interactive  | The executor blocks at each `human_handoff` step, emits a `human_step_pending` SSE event, and waits for `POST /v1/runs/:run_id/decisions`. |

---

## Local Development

```bash
cd services/test-generator
cp .env.example .env       # set ANTHROPIC_API_KEY
pnpm install
pnpm db:migrate:dev        # creates aeos_test_generator DB schema
pnpm dev                   # :3005
```

Smoke check:
```bash
TOKEN=$(curl -s -X POST http://localhost:3002/v1/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@dev-corp.local","password":"DevPassword1234!","tenant_slug":"dev-corp"}' \
  | jq -r .access_token)

curl -X POST http://localhost:3005/v1/test-cases/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"quick lead qual flow with one human approval"}'
```

---

## Database

- Engine: Postgres (`aeos_test_generator` DB — provisioned by `local-dev/init-db.sql`)
- ORM: Prisma 5
- Migrations: `prisma/migrations/`
- One model: `TestCase` (tenant-scoped, planJson is the canonical payload)

---

## Key Non-Negotiables

- `tenant_id` from JWT only — never from request bodies, query params, or path params.
- Auth on every endpoint (except `/healthz`, `/readyz`).
- Spans are emitted via `POST /v1/spans` on the Telemetry service — this service never writes to the spans DB directly. The mirror is **best-effort**: if Telemetry is unreachable (e.g. running test-generator standalone for QA), `postSpans` warns and continues so the run still completes; spans remain visible via the SSE event stream.
- `LedgerRow` is not touched by this service. Ever.
