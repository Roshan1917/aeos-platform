# LedgerRow Contract

The Economic Ledger is the core IP of AEOS. This document defines the immutability contract and correct usage patterns.

## The Law: Append-Only

`LedgerRow` records are **never** updated or deleted. This is enforced at:

1. **Schema level**: No `UPDATE`/`DELETE` permissions on `ledger_rows` table
2. **API level**: No update/delete endpoints in the Intelligence service
3. **Code review**: PRs that attempt in-place mutation are rejected

To correct an error: write a `CorrectionPayload` row that references the erroneous row via `corrects_row_id`.

## The Five-Row Lifecycle

For every agent decision, the full ledger record consists of five rows written in sequence:

```
1. Predicted  → Written by Intelligence at decision time (UEF score + expected value)
2. Actual     → Written by Intelligence when SoR connector reports back (real outcome)
3. Variance   → Written by Intelligence after Actual (delta + bucket classification)
4. Attribution → Written by Intelligence (root cause breakdown across 5 factors)
5. Correction  → Written only if error found (references the incorrect row)
```

## Correct Usage Patterns

### Writing a Predicted row (Intelligence service)

```typescript
import type { LedgerRow, PredictedPayload } from '@aeos/canonical-schema';
import { LedgerRowId } from '@aeos/canonical-schema';

const predicted: LedgerRow = {
  schema_version: '1.0',
  id: crypto.randomUUID() as LedgerRowId,
  tenant_id: tenantId,
  uop_id: uopId,
  agent_id: agentId,
  contract_id: contractId,
  decision_id: decisionId,
  row_type: 'predicted',
  recorded_at: new Date().toISOString(),
  signed_by_fuzebox: await signWithFuzeboxKey(rowHash),
  signed_by_rp: await signWithRPotentialKey(rowHash),
  payload: {
    type: 'predicted',
    uef_score: computedScore,
    predicted_value: 45000,
    predicted_currency: 'USD',
    confidence_interval_low: 38000,
    confidence_interval_high: 52000,
    model_version: '2024-Q4-v3',
  } satisfies PredictedPayload,
};

await db.ledgerRows.insert(predicted); // INSERT ONLY
```

### Writing a Correction row

```typescript
import type { CorrectionPayload } from '@aeos/canonical-schema';

const correction: LedgerRow = {
  // ... standard fields ...
  row_type: 'correction',
  payload: {
    type: 'correction',
    corrects_row_id: erroneousRowId,
    correction_reason: 'SoR returned corrected figure after initial sync error',
    corrected_by: 'system/sor-sync-reconciler',
    corrected_at: new Date().toISOString(),
  } satisfies CorrectionPayload,
};
```

## Co-Signature Requirement

Every `LedgerRow` must be co-signed by both parties:
- `signed_by_fuzebox`: signature from FuzeBox's signing key
- `signed_by_rp`: signature from rPotential's signing key

Both signatures cover the row hash (deterministic serialization of all non-signature fields).

This is a regulatory attestation requirement. Do not bypass. The Intelligence service handles signing via the substrate's signing service API.

## Querying

Always query with `tenant_id` filter:

```sql
SELECT * FROM ledger_rows
WHERE tenant_id = $1
  AND decision_id = $2
ORDER BY recorded_at ASC;
```

For analytics (ClickHouse):
```sql
SELECT
  uop_id,
  avg(v.variance_pct) as avg_variance_pct,
  countIf(v.variance_bucket = 'negative_underperformance') as underperformance_count
FROM ledger_rows
WHERE tenant_id = {tenant_id:String}
  AND row_type = 'variance'
  AND recorded_at >= {start:DateTime}
GROUP BY uop_id;
```
