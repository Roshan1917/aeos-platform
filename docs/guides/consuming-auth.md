# Consuming Auth + RBAC

All AEOS services use `@aeos/auth-client` (TypeScript) or `aeos-auth-client` (Python) for authentication and authorization.

The Auth service (substrate) is the identity source. It issues JWTs and manages RBAC via OpenFGA.

## TypeScript (Express)

### 1. Install

In-repo (workspace): already in `package.json` of `_template-ts`.

Separate repo:
```bash
pnpm add @aeos/auth-client@^0.1.0
```

### 2. Configure env vars

```bash
AUTH_JWT_SECRET=...     # from Secrets Manager: aeos/{env}/substrate/jwt-secret
AUTH_SERVICE_URL=...    # e.g. https://substrate.aeos.internal
```

### 3. Wire middleware (once at app level)

```typescript
import { requireAuth } from '@aeos/auth-client';

app.use(requireAuth());
// Now req.auth is available on every route handler:
// req.auth.userId   — string
// req.auth.tenantId — TenantId (branded string)
// req.auth.roles    — string[]
```

### 4. Permission checks

```typescript
import { requirePermission, checkPermission } from '@aeos/auth-client';

// Throws 403 (with code 'FORBIDDEN') if denied
await requirePermission(req.auth!, 'ledger_row', 'write');

// Non-throwing version
const { allowed } = await checkPermission(req.auth!, 'ledger_row', 'read');
if (!allowed) return res.status(403).json({ error: 'forbidden' });
```

### 5. Agent identity verification

For service-to-service calls that originate from an agent:

```typescript
import { verifyAgentContract } from '@aeos/auth-client';

const verification = await verifyAgentContract(contractId, agentId);
if (!verification.valid) {
  return res.status(401).json({ error: 'invalid_agent_identity' });
}
```

## Python (FastAPI)

### 1. Install

```bash
pip install aeos-auth-client>=0.1.0
```

### 2. Configure env vars

Same as TypeScript: `AUTH_JWT_SECRET`, `AUTH_SERVICE_URL`.

### 3. Use as FastAPI dependency

```python
from typing import Annotated
from fastapi import Depends
from aeos_auth_client import get_current_auth
from aeos_auth_client.types import AuthContext

@app.get("/v1/resource")
async def handler(auth: Annotated[AuthContext, Depends(get_current_auth)]):
    tenant_id = auth.tenant_id  # always use this, never req body
    ...
```

### 4. Permission checks

```python
from aeos_auth_client import require_permission, check_permission

# Raises 403 HTTPException if denied
await require_permission(auth, "ledger_row", "write")

# Non-raising version
result = await check_permission(auth, "report", "generate")
if not result.allowed:
    raise HTTPException(status_code=403, detail="insufficient permissions")
```

## RBAC Resource/Action Convention

Resources are snake_case nouns. Actions are CRUD verbs.

| Resource | Actions | Roles |
|---|---|---|
| `uop` | `read`, `write`, `delete` | admin, analyst |
| `process` | `read`, `write` | admin, analyst |
| `agent` | `read`, `write` | admin |
| `ledger_row` | `read`, `write` | admin, analyst (read), agent (write) |
| `recommendation` | `read`, `update_status` | admin, analyst |
| `attestation` | `read`, `generate` | admin |
| `tenant` | `read`, `update` | admin |

## Rules

1. Apply `requireAuth()` / `get_current_auth` to **all routes** except `/healthz` and `/readyz`.
2. **Never** extract `tenant_id` from request body or query params from external callers. Always use `req.auth.tenantId`.
3. Service-to-service calls: include the caller's JWT in the `Authorization: Bearer <token>` header.
4. Agent-originated calls: include `AgentContractId` in the JWT (set by the SDK adapter).

## Local dev

In local dev, `AUTH_JWT_SECRET` is the shared secret `aeos-dev-jwt-secret-local` (from `local-dev/.env.example`).

To generate a test token:
```typescript
import { createTestToken } from '@aeos/testing';
const token = createTestToken({ tid: tenantId('dev-tenant-001'), roles: ['admin'] });
```
