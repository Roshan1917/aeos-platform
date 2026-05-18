# @aeos/sdk-adapter-cowork

AEOS Agent Adapter for **Claude Cowork** — auto-detects skill execution from Cowork OTLP traces and logs and emits AEOS-attributed OTel spans.

Pattern transplanted from the AITT (`fuzebox-intelligence`) Cowork OTEL collector. Unlike vendor-SDK adapters that wrap a runtime, this adapter is a **post-hoc OTLP processor**: feed it the Cowork spans/logs your collector receives, and it returns AEOS skill events ready for ingest.

## Installation

```bash
npm install @aeos/sdk-adapter-cowork
```

## Usage

```typescript
import { CoworkAdapter } from '@aeos/sdk-adapter-cowork';

const adapter = new CoworkAdapter({
  config: {
    tenantId: 'tenant_abc123',
    agentId: 'agent_cowork',
    uopId: 'uop_kyc_review',
  },
  // Optional — defaults to 'skill.name'
  skillAttributeKey: 'skill.name',
  // Optional — Chrome MCP URL detection
  skillUrlPatterns: [
    { urlPattern: /\/kyc\/queue/, skillName: 'kyc-approvals' },
    { urlPattern: /\/refunds\/pending/, skillName: 'refund-review' },
  ],
});

// Process spans coming through your OTLP receiver
adapter.processSpan({
  spanId: span.spanId,
  attributes: flattenedAttrs,  // your normalized OTLP attribute map
  status: 'ok',
});

// Process logs (bash tool_result + Chrome MCP navigate)
adapter.processLog({
  body: log.body,
  sessionId: log.attributes['session.id'],
  isChromeNavigate: log.attributes['tool.name'] === 'Claude_in_Chrome',
  navigateUrl: extractNavigateUrl(log),
});
```

## Detection Paths

1. **Span path** — Any span with the configured `skillAttributeKey` (default `skill.name`) emits a decision span.
2. **Bash log path** — Log body matching `{"cowork_event":"skill_start","skill":"<name>"}` emits a decision span with that skill.
3. **Chrome MCP log path** — Logs from `Claude_in_Chrome` navigate calls are matched against `skillUrlPatterns[]`. Deduplicated per `session.id` so multiple navigations within a session emit only once.

## Caps

- Session-id dedup map is FIFO-evicted at 1000 entries to prevent unbounded growth.

## Source

`sdk/adapters/cowork/src/adapter.ts`
