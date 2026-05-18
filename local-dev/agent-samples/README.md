# Agent Samples

Runnable sample agents that exercise the AEOS local-dev stack end-to-end. Each sample makes a **real** call to a model provider (using your own API key), then emits AEOS-shaped spans to the telemetry service so you can watch the full classify → enrich → LangFuse → Kafka path light up.

These samples are **not** production code — they're demos for the agent-monitoring quick start. They live alongside the `seed/` scripts and assume the local stack has already been started and seeded.

## Available samples

| Sample | Provider | What it demonstrates |
|---|---|---|
| [anthropic-quote-agent/](./anthropic-quote-agent/) | Anthropic | LLM call → tokens + cost on `aeos.llm.call` span, `aeos.decision` parent span |
| [lead-qualification-flow/](./lead-qualification-flow/) | Anthropic | Full multi-step process trace — automated + agent (`llm_call`) + human (`human_handoff`, `aeos.human_override`) + automated, all under one root `aeos.decision`. Targets the `Lead Qualification Flow` process seeded by `seed-registries.ts`. |

## Conventions

- Each sample is its own pnpm workspace package under `local-dev/agent-samples/*`
- Each one has a `.env.example` listing required keys; never commit real `.env`
- Defaults assume the seeded `dev-corp` tenant and the standard substrate/telemetry ports (`3002`, `3003`)
- Span shape follows the AEOS adapter contract — see [sdk/CLAUDE.md](../../sdk/CLAUDE.md)

## Adding a new sample

```bash
cp -r local-dev/agent-samples/anthropic-quote-agent \
      local-dev/agent-samples/my-sample
# edit package.json name, src/index.ts, README, .env.example
pnpm install
```

The `local-dev/agent-samples/*` glob is already in `pnpm-workspace.yaml`, so new samples are picked up automatically on `pnpm install`.
