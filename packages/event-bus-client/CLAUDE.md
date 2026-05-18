# @aeos/event-bus-client

Tenant-scoped Kafka producer and consumer. All canonical events flow through this package.

## Rules

- **Never construct topic strings manually.** The client handles `aeos.{tenant_id}.{domain}.{event_type}` automatically.
- Every event carries `tenant_id`. The producer enforces this via headers.
- Events must be instances of canonical event types from `@aeos/canonical-schema/events`.

## Producer usage

```typescript
import { createProducer } from '@aeos/event-bus-client';
import { TelemetrySpanReceivedEvent } from '@aeos/canonical-schema/events';

const producer = createProducer({ tenantId, service: 'telemetry' });

await producer.publish({
  event_type: 'telemetry.span.received',
  schema_version: '1.0',
  event_id: crypto.randomUUID(),
  tenant_id: tenantId,
  timestamp: new Date().toISOString(),
  payload: span,
} satisfies TelemetrySpanReceivedEvent);

// Disconnect on shutdown
await producer.disconnect();
```

## Consumer usage

```typescript
import { createConsumer } from '@aeos/event-bus-client';
import type { TelemetrySpanReceivedEvent } from '@aeos/canonical-schema/events';

const consumer = createConsumer({
  tenantId,
  groupId: 'intelligence-ledger-writer',
  service: 'intelligence',
});

consumer.on<TelemetrySpanReceivedEvent>('telemetry.span.received', async (event) => {
  // event is fully typed
  await writeLedgerRow(event.payload);
});

await consumer.start();

// On shutdown
await consumer.stop();
```

## Required env vars

| Var | Description |
|---|---|
| `KAFKA_BROKERS` | Comma-separated broker list (e.g. `b-1.msk...:9096,b-2.msk...:9096`) |
| `KAFKA_SSL` | `true` for MSK / production |
| `KAFKA_SASL_USERNAME` | SASL username (MSK IAM or SCRAM) |
| `KAFKA_SASL_PASSWORD` | SASL password |

Local dev: brokers run in docker-compose at `localhost:9092` (no SSL/SASL).
