# @aeos/sdk-adapter-bedrock

AEOS Agent Adapter for AWS Bedrock. Wraps `BedrockRuntimeClient.InvokeModelCommand` to automatically emit AEOS-attributed OTel spans for every model invocation.

## Installation

```bash
npm install @aeos/sdk-adapter-bedrock
```

## Usage

```typescript
import { BedrockAdapter } from '@aeos/sdk-adapter-bedrock';

const adapter = new BedrockAdapter(
  {
    tenantId: 'tenant_abc123',
    agentId: 'agent_xyz789',
    uopId: 'uop_001',
    otlpEndpoint: 'http://otel-collector:4318',
  },
  'us-east-1',  // AWS region
);

// Invoke any Bedrock model
const bodyBytes = await adapter.invokeModel({
  modelId: 'anthropic.claude-sonnet-4-6',
  contentType: 'application/json',
  accept: 'application/json',
  body: JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Hello' }],
  }),
});

const result = JSON.parse(Buffer.from(bodyBytes).toString('utf-8'));
```

## Emitted Span Attributes

| Attribute | Value |
|---|---|
| `aeos.tenant_id` | From adapter config |
| `aeos.agent_id` | From adapter config |
| `aeos.uop_id` | From adapter config (optional) |
| `aeos.decision_id` | UUID per invocation |
| `aeos.vendor_runtime` | `aws_bedrock` |
| `aeos.model_provider` | Resolved from model ID prefix (e.g. `anthropic`) |
| `aeos.model_id` | Bedrock model ID (e.g. `anthropic.claude-sonnet-4-6`) |
| `aeos.output_tokens` | From response body (Anthropic/Titan models) |

## IAM Requirements

The adapter uses the default AWS credential chain. The executing role needs:
```
bedrock:InvokeModel
```
on the models you call.

## Status

Stub implementation — span emission hooks are defined; OTel wiring is `TODO`.
See `src/adapter.ts` for the full contract surface.
