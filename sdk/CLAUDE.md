# Agent Adapter SDK

Build-time tool (not runtime). Generates platform-specific bindings so agent frameworks automatically emit AEOS-compatible telemetry spans.

**Not a runtime dependency.** Developers run the SDK CLI during agent development to generate adapter code. The generated code adds OTel instrumentation; it does not add runtime overhead or dependencies on AEOS infrastructure.

---

## How It Works

1. Developer installs `aeos-sdk` CLI
2. Runs `aeos-sdk generate --target=anthropic` (or `langgraph`, `crewai`, etc.)
3. CLI generates adapter code specific to that framework
4. Agent developer includes the generated adapter in their agent
5. Adapter emits AEOS-attributed OTel spans during agent execution
6. Spans flow to AEOS Telemetry service via the OTel Collector

---

## CLI

```bash
# Install
npm install -g @aeos/adapter-sdk

# Generate adapter for a specific framework
aeos-sdk generate --target=anthropic --output=./adapters/
aeos-sdk generate --target=langgraph --output=./adapters/

# Validate adapter implementation
aeos-sdk validate ./adapters/anthropic/

# List supported targets
aeos-sdk targets
```

---

## Supported Targets (Phase 1 — 8 reference adapters)

| Target | Framework | Status |
|---|---|---|
| `anthropic` | Anthropic SDK | planned |
| `openai` | OpenAI SDK | planned |
| `bedrock` | AWS Bedrock | planned |
| `vertex` | Google Vertex AI | planned |
| `agentforce` | Salesforce AgentForce | planned |
| `langgraph` | LangGraph | planned |
| `crewai` | CrewAI | planned |
| `human-workflow` | Human-in-the-loop patterns | planned |

---

## Adapter Contract

Every adapter must emit OTel spans with these AEOS attributes:

```
aeos.tenant_id        — tenant identifier
aeos.agent_id         — agent identifier (registered in AEOS)
aeos.uop_id           — unit of performance (optional if not known at instrumentation time)
aeos.decision_id      — unique ID per agent decision cycle
aeos.vendor_runtime   — e.g. "anthropic_cloud", "aws_bedrock"
aeos.model_provider   — e.g. "anthropic", "openai"
aeos.model_id         — e.g. "claude-sonnet-4-6"
aeos.input_tokens     — input token count
aeos.output_tokens    — output token count
aeos.cost_usd         — cost in USD (if available)
aeos.hallucination_score — 0.0–1.0 (if available)
aeos.tool_name        — tool name (for tool_call spans)
aeos.tool_success     — boolean (for tool_call spans)
aeos.human_override   — boolean (if human took over)
```

---

## SDK Layout

```
sdk/
├── CLAUDE.md
├── packages/
│   └── sdk-core/              ← @aeos/adapter-sdk — core contract + binding generator
│       ├── src/
│       │   ├── contract.ts    ← Adapter contract interface
│       │   ├── generator.ts   ← Bindings generator
│       │   └── emitter.ts     ← Core OTel emitter
│       └── package.json
├── adapters/
│   ├── anthropic/             ← Reference adapter: Anthropic SDK
│   ├── openai/                ← Reference adapter: OpenAI SDK
│   ├── bedrock/
│   ├── vertex/
│   ├── agentforce/
│   ├── langgraph/
│   ├── crewai/
│   └── human-workflow/
└── cli/
    ├── src/
    │   └── commands/
    │       ├── generate.ts    ← aeos-sdk generate
    │       ├── validate.ts    ← aeos-sdk validate
    │       └── targets.ts     ← aeos-sdk targets
    └── package.json
```

---

## Open-Source Plan

At Day 180, the SDK is open-sourced in its own repo (`github.com/fuzebox/aeos-adapter-sdk`). The reference adapters serve as both documentation and community seed.
