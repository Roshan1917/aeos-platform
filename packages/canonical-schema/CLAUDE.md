# @aeos/canonical-schema

All shared domain types for the AEOS platform. Every service imports from here — never redefine types locally.

## PATENT WARNING

Four types are patent-adjacent. **Do not add fields, rename fields, or restructure without CTO approval** (danny.goldstein@fuzebox.ai):

| Type | Patent |
|---|---|
| `LedgerRow` | Families 2 & 8 (USPTO #63/898,712) |
| `Boundary` | Family 3 |
| `UoP` | Family 1 |
| `Attestation` | Family 8 |

## Language source of truth

TypeScript is canonical. Python types are **auto-generated** from TypeScript via `pnpm build:python`. Never edit `src/python/` directly.

If you change a TS type, rebuild Python: `pnpm --filter @aeos/canonical-schema build`.

## TypeScript usage

```typescript
import { LedgerRow, UoP, AeosSpan, TelemetrySpanReceivedEvent } from '@aeos/canonical-schema';
import type { TenantId } from '@aeos/canonical-schema';
```

For in-repo services (pnpm workspace): resolves automatically.
For separate repos: `pnpm add @aeos/canonical-schema@^0.1.0`

## Python usage

```python
from aeos_canonical_schema import LedgerRow, UoP, AeosSpan, Tenant
from aeos_canonical_schema.types import PredictedPayload, ActualPayload
```

## Key rules

- `LedgerRow` is **append-only**. No mutations. Compensating rows for corrections.
- All types carry `tenant_id`. Never strip it.
- `schema_version` fields exist on patent-adjacent types. Always pass them through.
- Breaking changes require a major version bump + an ADR in `docs/architecture/adr/`.

## Versioning

Uses Changesets. To propose a change: open a PR, run `pnpm changeset`, select the change type (patch/minor/major).

Breaking changes trigger a `#aeos-platform` Slack notice before publishing.
