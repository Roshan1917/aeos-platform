# Consuming the Event Bus

All canonical cross-service events flow through MSK Kafka via `@aeos/event-bus-client` (TS) or `aeos-event-bus-client` (Python).

## Topic Naming Convention

```
aeos.{tenant_id}.{domain}.{event_type}
```

Examples:
- `aeos.tenant-123.telemetry.telemetry.span.received`
- `aeos.tenant-123.ledger.ledger.row.written`

**Never construct topic names manually.** The client handles this. Manually constructing topic names is a multi-tenant data isolation risk.

## TypeScript

### Producing events

```typescript
import { createProducer } from '@aeos/event-bus-client';
import type { TelemetrySpanReceivedEvent } from '@aeos/canonical-schema/events';

const producer = createProducer({ tenantId, service: 'telemetry' });

await producer.publish({
  event_type: 'telemetry.span.received',
  schema_version: '1.0',
  event_id: crypto.randomUUID(),
  tenant_id: tenantId,
  timestamp: new Date().toISOString(),
  payload: span,
} satisfies TelemetrySpanReceivedEvent);

// Disconnect on SIGTERM
process.on('SIGTERM', () => producer.disconnect());
```

### Consuming events

```typescript
import { createConsumer } from '@aeos/event-bus-client';
import type { LedgerRowWrittenEvent } from '@aeos/canonical-schema/events';

const consumer = createConsumer({
  tenantId,
  groupId: 'intelligence-ledger-processor',
  service: 'intelligence',
});

consumer.on<LedgerRowWrittenEvent>('ledger.row.written', async (event) => {
  const row = event.payload; // fully typed as LedgerRow
  await processLedgerRow(row);
});

await consumer.start();

process.on('SIGTERM', async () => {
  await consumer.stop();
});
```

## Python

```python
from aeos_event_bus_client import create_producer, create_consumer

# Produce
producer = create_producer(tenant_id=tenant_id, service="telemetry")
await producer.publish(TelemetrySpanReceivedEvent(
    event_id=str(uuid4()),
    tenant_id=tenant_id,
    timestamp=datetime.utcnow().isoformat() + "Z",
    payload=span,
))

# Consume
consumer = create_consumer(
    tenant_id=tenant_id,
    group_id="intelligence-ledger-processor",
    service="intelligence",
)

async def handle_ledger_row(event: LedgerRowWrittenEvent) -> None:
    await process_ledger_row(event.payload)

consumer.on("ledger.row.written", handle_ledger_row)
await consumer.start()
```

## Canonical Event Types

| Event type | Domain | Producer | Consumers |
|---|---|---|---|
| `telemetry.span.received` | telemetry | Telemetry | Intelligence |
| `telemetry.span.enriched` | telemetry | Telemetry | Intelligence, Governance |
| `ledger.row.written` | ledger | Intelligence | Governance, Recommendations |
| `ledger.variance.detected` | ledger | Intelligence | Recommendations, Governance |
| `governance.policy.evaluated` | governance | Governance | (async notify) |
| `governance.attestation.generated` | governance | Governance | (async notify) |
| `registry.uop.registered` | registry | Assessment | Intelligence, Telemetry |
| `registry.process.registered` | registry | Process Discovery | Telemetry |
| `registry.agent.registered` | registry | Auth/Telemetry | Intelligence |

## Required Env Vars

| Var | Local value | Non-local value |
|---|---|---|
| `KAFKA_BROKERS` | `localhost:9092` | MSK broker list from Secrets Manager |
| `KAFKA_SSL` | `false` | `true` |
| `KAFKA_SASL_USERNAME` | unset | from Secrets Manager |
| `KAFKA_SASL_PASSWORD` | unset | from Secrets Manager |

## Local Dev

Topics are created by `local-dev/seed/kafka-topics.sh`. Run it after `docker-compose up -d`:

```bash
cd local-dev
./seed/kafka-topics.sh
```
