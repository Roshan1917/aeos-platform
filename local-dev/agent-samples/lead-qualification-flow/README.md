# Sample Agent — Lead Qualification Flow

End-to-end demo that emits **every step** of the seeded `Lead Qualification Flow` process — automated handoff, agent decision, human override, automated follow-up — as one trace to AEOS telemetry.

The process is created by [`local-dev/seed/seed-registries.ts`](../../seed/seed-registries.ts) under the `Qualify Inbound Lead` UoP. Steps:

| step_id | name                              | type      | span emitted                       |
|---------|-----------------------------------|-----------|------------------------------------|
| step-1  | Inbound Lead Received             | automated | `aeos.step.inbound_lead_received` (kind `internal`) |
| step-2  | Agent Qualifies Lead              | agent     | `aeos.llm.call` (kind `llm_call`, real Anthropic call) |
| step-3  | Human Reviews Borderline Cases    | human     | `aeos.human.handoff` (kind `human_handoff`, `aeos.human_override = true`) |
| step-4  | Update Salesforce                 | automated | `aeos.step.salesforce_update` (kind `internal`) |

All step spans share one `trace_id` + `decision_id` and hang off a root `aeos.decision` (`agent_decision`) span — same pattern an instrumented agent would emit at runtime.

## What each run does

1. Auths to substrate as `admin@dev-corp.local`
2. Looks up `agent_id` (`Lead Qualifier`), `uop_id` (`Qualify Inbound Lead`), `process_id` (`Lead Qualification Flow`) by name
3. Synthesizes a fake inbound lead (NorthStar Logistics)
4. Calls Anthropic for a JSON verdict (`qualified` / `unqualified` / `borderline`)
5. If `borderline`, runs a simulated human reviewer (configurable via `HUMAN_VERDICT`)
6. POSTs all 4–5 spans to telemetry `/v1/spans` in a single batch

Telemetry then classifies, enriches with `process_id`, mirrors to LangFuse, and emits a `telemetry.span.enriched` Kafka event per span.

## Prerequisites

```bash
cd local-dev && ./fresh-start.sh
# substrate :3002, telemetry :3003, seeds applied (tenant + registries)
```

Anthropic API key required.

## Setup

```bash
cd local-dev/agent-samples/lead-qualification-flow
cp .env.example .env
# edit .env, set ANTHROPIC_API_KEY=sk-ant-...
pnpm install
```

## Run

```bash
pnpm start
```

Force the human path (the synthesized lead is sized to land borderline by default, but you can pin it):

```bash
HUMAN_VERDICT=approve pnpm start
HUMAN_VERDICT=reject  pnpm start
```

## Verify

- **LangFuse UI**: http://localhost:3001 — project for tenant `dev-corp`, look for the new trace
- **Postgres**:
  ```bash
  psql postgresql://aeos:aeos_dev_password@localhost:5432/aeos_telemetry \
    -c "SELECT span_id, name, kind, attributes->>'aeos.step_id' AS step \
        FROM spans WHERE trace_id='<printed-trace-id>' ORDER BY start_time;"
  ```
- **Kafka**:
  ```bash
  docker exec -it local-dev-kafka-1 \
    kafka-console-consumer --bootstrap-server localhost:9092 \
    --topic aeos.<tenant_id>.telemetry.telemetry.span.enriched --from-beginning
  ```

## Notes

- Span shape mirrors the AEOS adapter contract — see [sdk/CLAUDE.md](../../../sdk/CLAUDE.md). When the real `@aeos/adapter-anthropic` + `@aeos/adapter-human-workflow` adapters are wired through OTel, this sample swaps to them with no shape change.
- Human step uses the `human_handoff` `SpanKind` and sets `aeos.human_override = true` per the human-workflow adapter contract.
- `aeos.process_id_hint` is informational; telemetry derives the authoritative `process_id` server-side from `uop_id`.
