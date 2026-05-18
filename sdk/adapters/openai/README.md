# @aeos/sdk-adapter-openai

AEOS Agent Adapter for the OpenAI SDK. Wraps `openai` Chat Completions to automatically emit AEOS-attributed OTel spans for every LLM call your agent makes.

## Installation

```bash
npm install @aeos/sdk-adapter-openai
```

## Usage

```typescript
import { OpenAIAdapter } from '@aeos/sdk-adapter-openai';

const adapter = new OpenAIAdapter(
  {
    tenantId: 'tenant_abc123',
    agentId: 'agent_xyz789',
    uopId: 'uop_001',          // optional
    otlpEndpoint: 'http://otel-collector:4318',
  },
  process.env.OPENAI_API_KEY,
);

// Use adapter.chat.completions.create() exactly like openai's client
const response = await adapter.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
});
```

## Emitted Span Attributes

| Attribute | Value |
|---|---|
| `aeos.tenant_id` | From adapter config |
| `aeos.agent_id` | From adapter config |
| `aeos.uop_id` | From adapter config (optional) |
| `aeos.decision_id` | UUID per call |
| `aeos.vendor_runtime` | `openai_cloud` |
| `aeos.model_provider` | `openai` |
| `aeos.model_id` | Model name (e.g. `gpt-4o`) |
| `aeos.input_tokens` | From OpenAI usage |
| `aeos.output_tokens` | From OpenAI usage |
| `aeos.cost_usd` | Estimated from token counts |

## Status

Stub implementation — span emission hooks are defined; OTel wiring is `TODO`.
See `src/adapter.ts` for the full contract surface.
