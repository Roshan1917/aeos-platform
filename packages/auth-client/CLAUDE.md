# @aeos/auth-client

JWT validation, RBAC permission checks, and agent identity verification.

Every inbound HTTP request in every service must pass through this package.

## TypeScript usage

```typescript
import { requireAuth, checkPermission, requirePermission } from '@aeos/auth-client';

// Express middleware — attach once at app level
app.use(requireAuth());

// req.auth is now populated: { userId, tenantId, roles, agentContractId? }

// Permission check (non-throwing)
const result = await checkPermission(req.auth, 'ledger_row', 'write');
if (!result.allowed) { ... }

// Permission check (throwing — 403 if denied)
await requirePermission(req.auth, 'ledger_row', 'write');
```

## Python (FastAPI) usage

```python
from typing import Annotated
from fastapi import Depends
from aeos_auth_client import get_current_auth, require_permission
from aeos_auth_client.types import AuthContext

@app.get("/v1/ledger")
async def get_ledger(auth: Annotated[AuthContext, Depends(get_current_auth)]):
    await require_permission(auth, "ledger_row", "read")
    # auth.tenant_id, auth.user_id, auth.roles available here
    ...
```

## Required env vars

| Var | Description |
|---|---|
| `AUTH_JWT_SECRET` | Shared HMAC secret for JWT validation (from Secrets Manager) |
| `AUTH_SERVICE_URL` | URL of the substrate Auth service (for RBAC + agent identity checks) |

## Endpoints called

- `POST /v1/rbac/check` — OpenFGA permission check
- `POST /v1/agent-contracts/{id}/verify` — agent identity verification

## Rules

- Apply `requireAuth()` / `get_current_auth` to every endpoint except `/healthz` and `/readyz`.
- Never extract `tenant_id` from request bodies or query params — always from `req.auth.tenantId`.
- Service-to-service calls must include the caller's JWT in the `Authorization` header.

## Status

Stub implementation. Real JWT validation uses the Auth service's JWKS endpoint in non-local environments. Local dev uses `AUTH_JWT_SECRET` shared secret.
