# ADR-002: ClickHouse as Economic Ledger Storage Backend

**Status:** Accepted
**Date:** 2026-04-27
**Author:** Danny Goldstein

## Context

The Intelligence service maintains the Economic Ledger — the core append-only audit log of agent economic performance. Each `LedgerRow` record captures a Predicted, Actual, or Variance measurement for a Unit of Potential (UoP) execution.

Key characteristics of `LedgerRow` data:

1. **Append-only.** No `UPDATE` or `DELETE` — ever. See [canonical-data-model.md](../canonical-data-model.md). This is a hard non-negotiable and patent-adjacent.
2. **High write volume.** Every UoP execution emits at least one `LedgerRow`. At scale (10+ tenants, multiple agent runs per minute), this is tens of thousands of rows per hour.
3. **Aggregation-heavy reads.** The Scoring Engine and BI surface issue queries like: `SUM(predicted_value)`, `AVG(variance_pct)`, `GROUP BY uop_id, tenant_id, date`. These are poorly served by row-oriented stores.
4. **Time-series access pattern.** Most queries filter by `created_at` range and `tenant_id`. Columnar storage with partition pruning maps well to this.
5. **No transactional updates.** Because `LedgerRow` is append-only, there is no need for full ACID transactions on individual rows.

The Scoring Engine must aggregate `LedgerRow` data across thousands of rows in real time to compute UEF dimension scores. Query latency at p95 must be under 500ms for dashboards to be useful.

## Decision

Use **ClickHouse** (ClickHouse Cloud, managed) as the storage backend for `LedgerRow` records and for the enriched OTel span store.

The Intelligence service writes `LedgerRow` records directly to ClickHouse via the ClickHouse HTTP client. The `@aeos/canonical-schema` `LedgerRow` type maps 1:1 to a ClickHouse table with `ReplacingMergeTree` engine disabled (append-only enforced at application layer) and `MergeTree` partitioned by `toYYYYMM(created_at)` and ordered by `(tenant_id, uop_id, created_at)`.

## Alternatives Considered

### Option A: RDS Postgres (rejected)

**Rejected.**

Postgres is used for all transactional state (Auth, Assessment, Governance). However:

- Row-oriented storage means aggregation queries (`SUM`, `AVG`, `GROUP BY`) require sequential scans at high row counts.
- At 10M+ rows (realistic at 6-month scale), dashboard queries without heavy indexing take seconds, not milliseconds.
- Adding indexes to support all scoring query patterns degrades write throughput.
- TimescaleDB (Postgres extension for time-series) was evaluated — it improves time-series queries but does not match ClickHouse columnar compression or vectorized query execution for aggregation workloads.

### Option B: TimescaleDB (rejected)

Improves Postgres time-series performance via hypertables. Better than vanilla Postgres for our access patterns, but:

- Aggregation query performance is still bounded by Postgres's row-oriented execution model.
- Compression helps storage but not vectorized execution.
- Requires running TimescaleDB as a Postgres extension or managed service — another Postgres variant to operate.
- ClickHouse is purpose-built for this exact workload and outperforms TimescaleDB by 5–50x on aggregation benchmarks at our anticipated data volume.

### Option C: Google BigQuery (rejected)

Strong analytical query performance and serverless. Rejected because:

- AEOS is AWS-native. BigQuery introduces a GCP dependency and cross-cloud egress costs.
- Data residency: BigQuery stores data in Google-managed regions, which complicates on-prem and siloed deployment modes.
- Latency: BigQuery cold query startup can be 1–3s; unsuitable for interactive dashboard queries.

### Option D: Amazon Redshift (rejected)

AWS-native columnar store. Rejected because:

- Provisioned Redshift has high fixed cost at small scale.
- Redshift Serverless has cold-start latency issues similar to BigQuery.
- ClickHouse Cloud offers better price/performance for append-heavy workloads with sub-second query SLAs.
- ClickHouse's `MergeTree` family is better suited to continuous high-frequency inserts than Redshift's micro-batch COPY pattern.

## Consequences

### Positive

- Sub-100ms p95 on dashboard aggregation queries up to 100M rows.
- ClickHouse columnar compression yields 5–10x storage reduction vs Postgres for `LedgerRow`.
- ClickHouse's append-only `MergeTree` engine aligns naturally with the `LedgerRow` invariant.
- ClickHouse Cloud (managed) eliminates cluster ops burden.

### Negative / Mitigations

| Consequence | Mitigation |
|---|---|
| New infrastructure dependency (ClickHouse Cloud) | Managed service — no ops burden; local dev uses `clickhouse/clickhouse-server` Docker image |
| Intelligence service needs ClickHouse client | `@clickhouse/client` (TS) is maintained and stable |
| Migration complexity: if we ever need to move off ClickHouse | `LedgerRow` schema is stable (patent-adjacent, CTO approval required for changes); migration risk is low |
| On-prem mode: customer must run ClickHouse | ClickHouse is Apache 2.0 licensed, straightforward to self-host; documented in on-prem runbook |
| No JOIN across Postgres + ClickHouse in a single query | Intelligence service orchestrates this in application code; no cross-DB JOINs needed |

## Implementation Notes

- ClickHouse connection string stored in Secrets Manager at `aeos/{env}/intelligence/clickhouse-dsn`.
- Local dev: ClickHouse runs via `docker-compose` in `local-dev/`.
- `LedgerRow` table DDL: `infra/clickhouse/migrations/001_create_ledger_row.sql`.
- The Scoring Engine reads from ClickHouse; the BI surface (read-only) also reads from ClickHouse.
- Writes go through the Intelligence service only — no other service writes to the `LedgerRow` table.
