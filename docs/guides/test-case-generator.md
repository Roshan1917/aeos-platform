# Test-Case Generator (services/test-generator)

LLM-driven generator + executor for synthetic AEOS agent traces. Internal QA tool. A tester describes a scenario in plain English, Claude returns a structured plan covering all canonical span kinds (`llm_call`, `tool_call`, `human_handoff`, `agent_decision`), and the executor turns the plan into spans that flow through the real Telemetry pipeline.

## When to use it

- Smoke-testing the full ingest path after a Telemetry / Substrate / web-app change
- Producing demo data for a stakeholder walkthrough without curling JSON
- Reproducing a specific trace shape ("five-step run with a rejected human override at step 3")

For high-fidelity end-to-end testing of a real adapter, prefer `local-dev/agent-samples/anthropic-quote-agent` instead — that one calls real Anthropic and exercises the SDK adapter chain.

## Setup

```bash
# 1. Bring up the local stack (postgres + substrate + telemetry)
cd local-dev
cp .env.services.example .env.services    # set ANTHROPIC_API_KEY
docker compose up -d postgres redis kafka langfuse openfga otel-collector localstack
docker compose up -d substrate telemetry

# 2. Seed a tenant + registries (gives the executor a real agent_id / uop_id)
pnpm tsx seed/seed-tenant.ts
pnpm tsx seed/seed-registries.ts

# 3. Start the test-generator service
docker compose up -d --build --force-recreate test-generator
# or for live development:
cd ../services/test-generator
cp .env.example .env                       # set ANTHROPIC_API_KEY
pnpm install
pnpm db:migrate:dev
pnpm dev                                   # :3005

# 4. Run the web app
cd ../../apps/web
pnpm dev                                   # :5173 → /test-cases
```

## End-to-end smoke

1. `http://localhost:5173/login` as `admin@dev-corp.local` / `DevPassword1234!` / `dev-corp`.
2. Navigate to **Test Cases**.
3. Prompt: *"5-step lead qualification: classify the lead, look up CRM, ask a human (rejected), retry, then decide."* Click **Generate plan**.
4. Plan preview shows 5 steps with mixed kinds. Click **Save**.
5. On the detail page, leave **Synthetic** + **Auto** selected. Click **Run**.
6. Run viewer shows step-by-step events ending in `run_completed`. Click **View trace waterfall**.
7. `/telemetry` shows new spans (one of each kind). LangFuse UI (`http://localhost:3001`) shows the mirrored generation + spans.

## Modes

| `mode`     | Effect |
|------------|--------|
| synthetic  | Spans built entirely from plan attribute values. No external calls beyond `POST /v1/spans`. |
| live       | `llm_call` steps invoke the Anthropic API; the resulting span carries real `aeos.input_tokens`, `aeos.output_tokens`, `aeos.cost_usd`. Other step kinds remain synthetic. |

| `human_mode`  | Effect |
|---------------|--------|
| auto          | `human_handoff` spans emit immediately using the plan's `expected_decision`. |
| interactive   | Executor pauses at each `human_handoff`. Web UI opens an approval dialog; `POST /v1/runs/:run_id/decisions` (called by the dialog) unblocks the run. |

## API

See [services/test-generator/CLAUDE.md](../../services/test-generator/CLAUDE.md) for the full API surface.

## Notes

- The executor resolves a real `agent_id` and `uop_id` from substrate before emitting (otherwise spans wouldn't make it onto the Kafka enrichment topic). Run `seed-registries.ts` first.
- The Anthropic key lives in `services/test-generator/.env` (local dev) or `local-dev/.env.services` (when running via docker compose). In deployed environments source it from AWS Secrets Manager via External Secrets Operator, same pattern as substrate's LangFuse keys.
- This is the first FE write surface outside the two `PATCH` endpoints called out in `apps/web/CLAUDE.md`. Test cases are tenant-scoped; cross-tenant reads are blocked at the DB query level (every Prisma call filters by `tenantId`).
- Real tool runtimes are out of scope — `tool_call` steps are always synthetic. If you need authentic tool spans, add them to `local-dev/agent-samples/`.
