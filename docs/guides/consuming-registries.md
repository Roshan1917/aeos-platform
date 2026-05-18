# Consuming Semantic Registries

The AEOS platform maintains three semantic registries. Use `@aeos/registry-client` (TypeScript) or `aeos_registry_client` (Python) to read from them. Never bypass the client.

## The Three Registries

| Registry | What It Stores | Authoritative Writer |
|---|---|---|
| **UoP Registry** | Units of Potential — named, measurable chunks of work an agent performs (e.g., "Generate Proposal Draft") | Process Discovery service |
| **Process Registry** | Business processes that UoPs belong to (e.g., "Proposal Management"). Hierarchical: Process → UoP. | Process Discovery service |
| **Agent Registry** | Registered AI agents — identity, capabilities, owning tenant, linked contracts | Substrate (via Agent Identity API) |

All registry data is scoped to a `tenant_id`. Never read records from another tenant.

## Write Permission Policy

Only the authoritative writer may create or update records in a registry. All other services are **read-only**.

- Process Discovery: writes UoP and Process records.
- Substrate: writes Agent records (via Agent Identity API).
- All other services (Telemetry, Intelligence, Recommendations, Governance, Assessment): read-only.

If your service needs a UoP or Process record to exist, it should fail gracefully (throw `RegistryNotFoundError`) and surface this to the operator — not create one itself.

## Required Environment Variable

```bash
REGISTRY_URL=https://substrate.aeos.internal   # Points to the Substrate service
```

Local dev: `REGISTRY_URL=http://localhost:3002` (set in `.env.example`).

## TypeScript Usage

### Install

In-repo (workspace): already in `_template-ts` `package.json`.

Separate repo:
```bash
pnpm add @aeos/registry-client@^0.1.0
```

### Initialize the client

```typescript
import { RegistryClient } from '@aeos/registry-client';

const registry = new RegistryClient({
  baseUrl: process.env.REGISTRY_URL!,
  auth: req.auth,  // pass the AuthContext from requireAuth()
});
```

The client automatically scopes all requests to `req.auth.tenantId`. You do not need to pass `tenant_id` separately.

### UoP Registry

#### Get a UoP by ID (throws if not found)

```typescript
import { RegistryNotFoundError } from '@aeos/registry-client';

try {
  const uop = await registry.uop.getOrThrow(uopId);
  // uop.id, uop.name, uop.processId, uop.tenantId, uop.metadata
} catch (err) {
  if (err instanceof RegistryNotFoundError) {
    // UoP doesn't exist — surface to operator, do not create
    throw new Error(`UoP ${uopId} not found in registry`);
  }
  throw err;
}
```

#### List UoPs with a filter

```typescript
const uops = await registry.uop.list({
  processId: 'proc_abc123',   // optional: filter by parent process
  limit: 50,
  offset: 0,
});
// uops.items: UoP[]
// uops.total: number
```

#### Write (Process Discovery service only)

```typescript
const uop = await registry.uop.create({
  name: 'Generate Proposal Draft',
  processId: 'proc_abc123',
  metadata: { expectedDurationMs: 5000 },
});
```

### Process Registry

#### Get a Process by ID (throws if not found)

```typescript
const process = await registry.process.getOrThrow(processId);
// process.id, process.name, process.tenantId, process.uopIds
```

#### List Processes

```typescript
const processes = await registry.process.list({ limit: 20, offset: 0 });
```

### Agent Registry

#### Get an Agent by ID (throws if not found)

```typescript
const agent = await registry.agent.getOrThrow(agentId);
// agent.id, agent.name, agent.tenantId, agent.capabilities, agent.contractIds
```

#### List Agents

```typescript
const agents = await registry.agent.list({
  capability: 'proposal-generation',  // optional filter
  limit: 20,
  offset: 0,
});
```

### Caching locally

If your service calls the same UoP or Process record on every request, cache it in Redis (or in-process for read-heavy paths). Use `tenant_id` in the cache key.

```typescript
import { createCache } from '@aeos/registry-client';

// In-process LRU cache — suitable for immutable registry data
const uopCache = createCache<UoP>({ maxSize: 500, ttlMs: 60_000 });

async function getUop(auth: AuthContext, uopId: string): Promise<UoP> {
  const cacheKey = `${auth.tenantId}:${uopId}`;
  const cached = uopCache.get(cacheKey);
  if (cached) return cached;

  const uop = await registry.uop.getOrThrow(uopId);
  uopCache.set(cacheKey, uop);
  return uop;
}
```

## Python Usage

### Install

In-repo services: defined in `pyproject.toml` of `_template-py`.

Separate repo:
```bash
pip install aeos-registry-client>=0.1.0
```

### Initialize the client

```python
from aeos_registry_client import RegistryClient
from aeos_auth_client.types import AuthContext

def get_registry(auth: AuthContext) -> RegistryClient:
    return RegistryClient(
        base_url=settings.REGISTRY_URL,
        auth=auth,
    )
```

### UoP Registry

#### Get a UoP by ID (raises if not found)

```python
from aeos_registry_client.exceptions import RegistryNotFoundError

try:
    uop = await registry.uop.get_or_raise(uop_id)
    # uop.id, uop.name, uop.process_id, uop.tenant_id
except RegistryNotFoundError:
    raise ValueError(f"UoP {uop_id} not found — cannot proceed")
```

#### List UoPs with a filter

```python
result = await registry.uop.list(process_id="proc_abc123", limit=50, offset=0)
# result.items: list[UoP]
# result.total: int
```

#### Write (Process Discovery service only)

```python
uop = await registry.uop.create(
    name="Generate Proposal Draft",
    process_id="proc_abc123",
    metadata={"expected_duration_ms": 5000},
)
```

### Process Registry

```python
process = await registry.process.get_or_raise(process_id)
processes = await registry.process.list(limit=20, offset=0)
```

### Agent Registry

```python
agent = await registry.agent.get_or_raise(agent_id)
agents = await registry.agent.list(capability="proposal-generation", limit=20, offset=0)
```

### Caching locally (Python)

```python
from functools import lru_cache
import asyncio

# Simple in-process cache — suitable for immutable registry records
_uop_cache: dict[str, UoP] = {}

async def get_uop_cached(auth: AuthContext, uop_id: str) -> UoP:
    key = f"{auth.tenant_id}:{uop_id}"
    if key not in _uop_cache:
        _uop_cache[key] = await registry.uop.get_or_raise(uop_id)
    return _uop_cache[key]
```

For production services, use Redis via the `aeos-auth-client` cache helpers instead of an in-process dict.

## Common Patterns

### Pattern: Get-or-throw at request boundary

Validate registry references at the start of a request handler, not deep inside business logic. This surfaces missing data early and keeps error messages clear.

```typescript
// Good
const [uop, agent] = await Promise.all([
  registry.uop.getOrThrow(body.uopId),
  registry.agent.getOrThrow(body.agentId),
]);
// ... proceed with confidence
```

### Pattern: List with filter for bulk operations

```typescript
// Fetching all UoPs for a process to compute aggregate scores
const { items: uops } = await registry.uop.list({ processId });
const scores = await Promise.all(uops.map(uop => scoreEngine.score(uop)));
```

### Pattern: Existence check before referencing

```typescript
// If you need to log a warning rather than throw, use get() instead of getOrThrow()
const uop = await registry.uop.get(uopId);
if (!uop) {
  logger.warn({ uopId }, 'UoP not found in registry — skipping enrichment');
  return null;
}
```

## What NOT to Do

**Never construct registry URLs manually:**
```typescript
// WRONG
const res = await fetch(`${process.env.REGISTRY_URL}/v1/uops/${uopId}?tenant_id=${tenantId}`);
```
Always use `@aeos/registry-client`. The client handles auth headers, tenant scoping, error translation, and retries.

**Never bypass the registry with direct DB queries:**
```typescript
// WRONG — services do not share databases
const uop = await db.query('SELECT * FROM uops WHERE id = $1', [uopId]);
```
Registries are served by the Substrate service over HTTP. Do not access the registry database tables directly.

**Never write to a registry you don't own:**
- Telemetry, Intelligence, Recommendations, Governance: read-only
- Process Discovery: can write UoP and Process
- Substrate: can write Agent

**Never pass tenant_id from request body:**
```typescript
// WRONG
const uops = await registry.uop.list({ tenantId: req.body.tenantId });  // untrusted
```
The client extracts `tenant_id` from the `auth` context (JWT). Never override it from user input.

## Related Docs

- [consuming-auth.md](consuming-auth.md) — Auth setup required before using registry client
- [service-map.md](../architecture/service-map.md) — Which service writes which registry
- [adr/ADR-003-kafka-canonical-bus.md](../architecture/adr/ADR-003-kafka-canonical-bus.md) — Event bus (complement to registries)
