# AEOS Canonical Data Model

All types live in `packages/canonical-schema/`. TypeScript is the source of truth. Python types are auto-generated.

## Patent-Adjacent Types

The following types are covered by FuzeBox's patent portfolio (USPTO Provisional #63/898,712). **Do not add fields, rename fields, or restructure these types without explicit CTO approval (danny.goldstein@fuzebox.ai).**

| Type | Patent Family | File |
|---|---|---|
| `UoP` | Family 1 — GSTI + Coordination Tax | `types/uop.ts` |
| `Agent` | Family 1 | `types/agent.ts` |
| `AgentContract` | Family 1 | `types/agent-contract.ts` |
| `Boundary` | Family 3 — Integration Abstraction + Boundary Controls | `types/boundary.ts` |
| `LedgerRow` | Families 2 & 8 — Execution Economic Ledger | `types/ledger-row.ts` |
| `AttestationBundle` | Family 8 | `types/attestation.ts` |

## LedgerRow (Most Critical Type)

`LedgerRow` is **append-only**. This is enforced at:
- Application layer (no update/delete endpoints)
- Database layer (no `UPDATE`/`DELETE` grants on the `ledger_rows` table)
- Code review policy (PRs touching LedgerRow schema require CTO review)

Five row types form the full ledger record for one decision:

```
decision_id: "dec-123"
  ├── LedgerRow (predicted) — UEF score + predicted business value
  ├── LedgerRow (actual)    — Actual value from SoR (Salesforce/SAP)
  ├── LedgerRow (variance)  — Computed delta, classified into 5 buckets
  ├── LedgerRow (attribution) — Root cause analysis across 5 factor types
  └── LedgerRow (correction)  — Only if error found; references the row it corrects
```

### Variance Buckets

| Bucket | Meaning |
|---|---|
| `within_tolerance` | Delta within ±5% of predicted |
| `positive_overperformance` | Agent exceeded prediction |
| `negative_underperformance` | Agent fell short |
| `data_quality_issue` | SoR data was missing or malformed |
| `model_drift` | Scoring model needs retraining |

### UEF Score (8 Dimensions)

The Unified Execution Framework score in `PredictedPayload`:

| Dimension | Measures |
|---|---|
| `task_completion` | Did the agent complete the assigned task? |
| `decision_quality` | Quality of decisions made during execution |
| `resource_efficiency` | Token usage, cost, latency efficiency |
| `compliance_adherence` | Policy and boundary adherence |
| `human_oversight_ratio` | Appropriate human involvement rate |
| `error_recovery` | How well the agent recovered from errors |
| `knowledge_utilization` | Effective use of available context |
| `coordination_effectiveness` | Multi-agent coordination quality |

`composite` = weighted average using `AgentContract.scoring_weights`.

## Type Versioning

Types with `schema_version` fields:
- `UoP.schema_version` = `"1.0"`
- `Agent.schema_version` = `"1.0"`
- `AgentContract.schema_version` = `"1.0"`
- `Boundary.schema_version` = `"1.0"`
- `LedgerRow.schema_version` = `"1.0"`
- `AttestationBundle.schema_version` = `"1.0"`

On any breaking change to these types: bump the `schema_version`, bump the npm major version, write an ADR.

## Tenant Isolation

Every canonical type carries `tenant_id`. This is enforced at multiple layers:

1. **Package layer**: Types have `tenant_id` as required non-optional field
2. **Event bus**: Producer automatically adds `aeos-tenant-id` header; topic name includes tenant ID
3. **Database**: Every table has `tenant_id TEXT NOT NULL`; application code must always filter by it
4. **API layer**: `tenant_id` is always extracted from the JWT (`req.auth.tenantId`), never from request body/query params
