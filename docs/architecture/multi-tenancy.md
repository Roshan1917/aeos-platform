# Multi-Tenancy

## Model

AEOS uses **logical isolation** (shared infrastructure, per-tenant data partitioning) in pooled mode, and **physical isolation** (dedicated infrastructure) in siloed mode.

## Tenant ID

Every canonical type, DB row, cache key, and Kafka event carries `tenant_id`.

- Source of truth: JWT payload — `tenant_id` claim
- Never trust `tenant_id` from request body, query params, or path params from external callers
- Always extract from `req.auth.tenantId` (TS) or `auth.tenant_id` (Python)

## Database

- Every table has `tenant_id TEXT NOT NULL` as a non-nullable indexed column
- RLS (Row Level Security) is NOT used — application-layer filtering is mandatory
- Every `SELECT`, `INSERT`, `UPDATE`, `DELETE` statement must include `WHERE tenant_id = $1`
- Multi-tenant queries (for analytics) are only issued by internal platform services with explicit cross-tenant grants; never by differentiated services

## Kafka

- Topic naming: `aeos.{tenant_id}.{domain}.{event_type}`
- Tenant isolation is enforced by the `@aeos/event-bus-client` — never construct topic names manually
- Each topic has a separate consumer group per service-per-tenant

## Encryption

- Per-tenant KMS data keys (AWS KMS) — stored in Secrets Manager at `aeos/{env}/{tenant_id}/kms-key-id`
- At-rest encryption: AES-256 for S3 (attestation bundles, documents)
- In-transit: TLS 1.3 everywhere

## Deployment Mode Variants

| Concern | Pooled | Siloed | On-prem |
|---|---|---|---|
| EKS cluster | Shared | Dedicated per tenant | Customer-operated |
| Postgres | Shared RDS, partitioned by tenant_id | Dedicated RDS instance | Customer-operated |
| Kafka | Shared MSK, tenant-scoped topics | Dedicated MSK | Customer-operated |
| KMS keys | Per-tenant keys in shared account | Per-tenant keys in dedicated account | Customer-operated |
| Network | Shared VPC, tenant RBAC | Dedicated VPC | Customer network |
