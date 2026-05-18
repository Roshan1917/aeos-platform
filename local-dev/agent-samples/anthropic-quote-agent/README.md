# Sample Agent — Anthropic Quote Generator

Minimal end-to-end demo of the AEOS telemetry monitoring path.

What it does on each run:

1. Authenticates to the **substrate** as the dev-corp admin (seeded by `seed-tenant.ts`)
2. Resolves the first registered `agent_id` and `uop_id` (seeded by `seed-registries.ts`)
3. Calls the **Anthropic API** with a tiny sales-quote prompt
4. Builds two AEOS spans (`aeos.decision` + `aeos.llm.call` with real token counts and cost)
5. Emits them to either or both of:
   - the **telemetry** service `/v1/spans` (production pipeline — classification, enrichment, Kafka, LangFuse mirror)
   - **LangFuse** `/api/public/otel/v1/traces` directly via OTLP/HTTP Basic auth — skips the telemetry service. Useful when telemetry isn't deployed yet, or to smoke-test a fresh LangFuse stand-up.

## Prerequisites

You need an Anthropic API key. Pick one of two stack targets:

### Local stack

See [docs/guides/agent-monitoring-quick-start.md](../../../docs/guides/agent-monitoring-quick-start.md):

```bash
cd local-dev && ./fresh-start.sh
# substrate :3002, telemetry :3003, LangFuse :3001, seeds applied
```

### Staging cluster

Deployed at `https://staging.aeos.fuzebox.ai`. Substrate seed must have been
run against staging at least once (`AEOS_SUBSTRATE_URL=https://staging.aeos.fuzebox.ai/api/substrate pnpm tsx local-dev/seed/seed-tenant.ts && pnpm tsx local-dev/seed/seed-registries.ts`).
LangFuse direct push also needs API keys minted in the LangFuse UI.

## Setup

```bash
cd local-dev/agent-samples/anthropic-quote-agent
cp .env.example .env
# edit .env, set ANTHROPIC_API_KEY=sk-ant-...
pnpm install
```

## Run

```bash
pnpm start
```

Configure `.env` for one of three modes:

| Mode | `TELEMETRY_URL` | `LANGFUSE_HOST` + `_PUBLIC_KEY` + `_SECRET_KEY` |
|---|---|---|
| Local (default) | `http://localhost:3003` | unset (telemetry mirrors to local LangFuse for you) |
| Staging via telemetry | `https://staging.aeos.fuzebox.ai/api/telemetry` | unset |
| Staging direct to LangFuse | unset | `https://staging-langfuse.aeos.fuzebox.ai` + minted keys |
| Both (staging) | `…/api/telemetry` | LangFuse vars set |

Expected output (staging direct-to-LangFuse mode):

```
[1/4] Authenticating to substrate…
[2/4] Resolving agent_id + uop_id from registries…
[3/4] Calling Anthropic (claude-sonnet-4-6)…
---
<2-sentence quote summary>
---
[4/4] Emitting AEOS spans to telemetry service…
POST https://staging-langfuse.aeos.fuzebox.ai/api/public/otel/v1/traces → 200
```

## Verify

- **LangFuse UI**: http://localhost:3001 — switch to the project for tenant `dev-corp` and find the new trace
- **Postgres**:
  ```bash
  psql postgresql://aeos:aeos_dev_password@localhost:5432/aeos_telemetry \
    -c "SELECT span_id, name, kind, attributes->>'aeos.cost_usd' AS cost \
        FROM spans ORDER BY start_time DESC LIMIT 5;"
  ```
- **Kafka**:
  ```bash
  docker exec -it local-dev-kafka-1 \
    kafka-console-consumer --bootstrap-server localhost:9092 \
    --topic aeos.<tenant_id>.telemetry.telemetry.span.enriched --from-beginning
  ```

## Customize

- `ANTHROPIC_MODEL` — switch between `claude-sonnet-4-6`, `claude-opus-4-7`, `claude-haiku-4-5-20251001` (pricing table in `src/index.ts`)
- Edit the prompt in `src/index.ts` to demo other UoPs, then re-run

## Notes

This sample emits spans **directly** via HTTP — it does **not** use the (still stubbed) `@aeos/adapter-anthropic` SDK. Swap to the adapter once it's wired through the OTel collector path; the span shape stays identical.
