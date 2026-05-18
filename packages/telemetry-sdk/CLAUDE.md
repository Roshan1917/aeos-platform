# @aeos/telemetry-sdk

Pre-configured OTEL tracer. Never use raw `@opentelemetry/api` in services — use this wrapper so all spans get canonical attribute names.

## Usage

```typescript
import { initTracing, getTracer, SpanAttributes } from '@aeos/telemetry-sdk';

// Call once at service startup (before anything else)
initTracing('my-service', '1.0.0');

const tracer = getTracer('my-service');

const span = tracer.startSpan('process-ledger-row');
span.setAttribute(SpanAttributes.TENANT_ID, tenantId);
span.setAttribute(SpanAttributes.AGENT_ID, agentId);
span.setAttribute(SpanAttributes.INPUT_TOKENS, 1200);
span.end();
```

## Required env vars

| Var | Description |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector endpoint (e.g. `http://otel-collector:4318/v1/traces`) |
| `PLATFORM_ENV` | `local` / `non-prod` / `prod` |

If `OTEL_EXPORTER_OTLP_ENDPOINT` is not set, tracing is disabled (no error thrown).

## Python (OpenTelemetry)

```python
from aeos_telemetry_sdk import init_tracing, get_tracer, SpanAttributes

init_tracing("my-service", "1.0.0")
tracer = get_tracer("my-service")

with tracer.start_as_current_span("process-ledger-row") as span:
    span.set_attribute(SpanAttributes.TENANT_ID, tenant_id)
    span.set_attribute(SpanAttributes.INPUT_TOKENS, 1200)
```
