# @aeos/testing

Shared fixtures, factories, and mocks for unit and integration tests.

## Usage

```typescript
import {
  makeTenant, makeUoP, makeAgent, makeSpan,
  createTestToken, createTestAuthHeader, TEST_JWT_SECRET,
  createMockProducer, createMockConsumer,
  MockUoPRegistry, MockProcessRegistry, MockAgentRegistry,
  createSeededRegistries,
} from '@aeos/testing';
```

---

## Canonical type factories

```typescript
const tenant = makeTenant();
const uop    = makeUoP(tenant.id);
const agent  = makeAgent(tenant.id);
const span   = makeSpan(tenant.id, { agent_id: agent.id });
```

All factories accept partial overrides. Defaults produce valid canonical types.

---

## Auth helpers

```typescript
// JWT for testing auth middleware
const token = createTestToken({ tid: tenant.id, roles: ['analyst'] });
const authHeader = createTestAuthHeader({ tid: tenant.id });

// In test setup — point auth client to test secret
process.env.AUTH_JWT_SECRET = TEST_JWT_SECRET;
```

---

## Mock Kafka (`MockProducer` / `MockConsumer`)

Drop-in replacements for `AeosProducer` / `AeosConsumer`. No Kafka connection needed.

```typescript
// Producer — capture published events
const producer = createMockProducer({ tenantId: tenant.id });
await producer.publish({ event_type: 'telemetry.span.received', ...span });

producer.assertPublished('telemetry.span.received');
const events = producer.eventsOfType('telemetry.span.received');
producer.reset(); // clear between tests

// Consumer — inject events to trigger handlers
const consumer = createMockConsumer({ tenantId: tenant.id, groupId: 'test-group' });
consumer.on('ledger.row.written', async (event) => { /* handler */ });
await consumer.start();

await consumer.inject({ event_type: 'ledger.row.written', ...row }); // fires handler
await consumer.injectAll([event1, event2]);
```

---

## Mock Registries

Drop-in replacements for `UoPRegistry`, `ProcessRegistry`, `AgentRegistry`. In-memory.

```typescript
// Manual setup
const uopRegistry = new MockUoPRegistry({ tenantId: tenant.id });
uopRegistry.seed([uop1, uop2]);

const found = await uopRegistry.get(uop1.id);      // resolves
const all   = await uopRegistry.list({ status: 'active' });
const created = await uopRegistry.create({ name: 'New UoP', ... });
uopRegistry.reset(); // clear between tests

// Convenience: pre-seeded registries for common test scenarios
const { tenantId, uopRegistry, processRegistry, agentRegistry, uops, agents } =
  createSeededRegistries({ uopCount: 3, agentCount: 2 });
```

`MockProcessRegistry` supports `get(id)` and `listByUoP(uopId)`.
`MockAgentRegistry` supports `get(id)` and `list({ status })`.

---

## Rules

- `TEST_JWT_SECRET` must never be used outside test environments.
- Factories always return valid canonical types — update factories when type signatures change.
- Mocks implement the same async API as real clients — swap at the DI boundary.
