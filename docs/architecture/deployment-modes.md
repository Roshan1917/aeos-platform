# Deployment Modes

AEOS ships in three deployment modes. One codebase — different Helm values per mode.

## Modes at a Glance

| Mode | Isolation | AWS Account | When | Target Customer |
|---|---|---|---|---|
| **Pooled multi-tenant** | Logical (tenant_id partitioning) | Shared `non-prod` / `prod` accounts | Default — all non-enterprise tenants | SMB, mid-market |
| **Siloed single-tenant** | Physical (dedicated infra per tenant) | Dedicated AWS account per tenant | Enterprise tenants (Phase 2+, Day 61+) | Enterprise, regulated industries |
| **On-premise** | Physical (customer-operated infra) | N/A — customer-managed | Phase 3+, Day 121+ | Highly regulated, air-gapped |

---

## Mode 1: Pooled Multi-Tenant

### Description

All tenants share a single EKS cluster, a single RDS Postgres instance, a single MSK Kafka cluster, and a single ElastiCache Redis cluster. Isolation is enforced at the application layer via `tenant_id`.

### When to Use

- Default for all new tenants
- Used for `non-prod` (dev + staging) in all cases
- Used for `prod` until a tenant requests siloed mode

### AWS Account Structure

```
aws-account: aeos-non-prod
  └── EKS cluster: aeos-non-prod
        ├── namespace: substrate
        ├── namespace: differentiated
        ├── namespace: platform
        └── namespace: observability

aws-account: aeos-prod
  └── EKS cluster: aeos-prod
        ├── namespace: substrate
        ├── namespace: differentiated
        ├── namespace: platform
        └── namespace: observability
```

### tenant_id Isolation

| Layer | Mechanism |
|---|---|
| Postgres | Every table has `tenant_id TEXT NOT NULL`. Every query filters `WHERE tenant_id = $1`. No RLS — application-layer enforcement. |
| Kafka | Topic naming: `aeos.{tenant_id}.{domain}.{event_type}`. `@aeos/event-bus-client` enforces this — never construct topics manually. |
| Redis | Cache keys are prefixed: `{tenant_id}:{key}`. Enforced by `@aeos/auth-client` session helpers. |
| S3 | Object paths: `s3://aeos-{env}-documents/{tenant_id}/...`. |
| KMS | Per-tenant data keys stored in Secrets Manager at `aeos/{env}/{tenant_id}/kms-key-id`. |

### Data Topology

```
┌─────────────────────────────────────────────────────┐
│  Shared RDS Postgres (Multi-AZ)                      │
│  All services, all tenants, partitioned by tenant_id │
├─────────────────────────────────────────────────────┤
│  Shared MSK Kafka                                    │
│  aeos.{tenant_id}.{domain}.{event}                  │
├─────────────────────────────────────────────────────┤
│  Shared ElastiCache Redis                            │
│  Keys: {tenant_id}:{key}                            │
├─────────────────────────────────────────────────────┤
│  Shared ClickHouse Cloud                             │
│  LedgerRow + Span tables, tenant_id column           │
└─────────────────────────────────────────────────────┘
```

### Helm Values

```yaml
# helm/values-pooled.yaml
mode: pooled
database:
  sharedRds: true
  host: aeos-prod.cluster-xyz.us-east-1.rds.amazonaws.com
kafka:
  sharedMsk: true
  bootstrapServers: b-1.aeos-prod.xyz.kafka.us-east-1.amazonaws.com:9092
redis:
  sharedElasticache: true
  host: aeos-prod.abc.cache.amazonaws.com
clickhouse:
  host: aeos-prod.clickhouse.cloud
tenantIsolation: logical
```

---

## Mode 2: Siloed Single-Tenant

### Description

Each enterprise tenant gets a dedicated AWS account, dedicated EKS cluster, dedicated Postgres, dedicated Kafka, and dedicated Redis. Infrastructure is provisioned via Terraform per-tenant account. Code is identical to pooled mode — only Helm values differ.

### When to Use

- Enterprise contracts requiring data residency guarantees
- Tenants in regulated industries (financial services, healthcare)
- Phase 2+, available from Day 61

### AWS Account Structure

```
aws-account: aeos-tenant-acme-prod
  ├── EKS cluster: aeos-acme-prod
  ├── RDS Postgres (dedicated)
  ├── MSK Kafka (dedicated)
  ├── ElastiCache Redis (dedicated)
  ├── ClickHouse (dedicated cloud org or self-managed)
  └── KMS keys, Secrets Manager (tenant-scoped)

aws-account: aeos-tenant-globo-prod
  └── ... (same structure, separate account)
```

Managed from: `infra/terraform/modules/siloed-tenant/` — one Terraform workspace per tenant.

### tenant_id Isolation

Physical isolation: the tenant's infrastructure is separate. `tenant_id` is still present on all data (for consistency with pooled code paths and audit logging), but cross-tenant access is impossible by network boundary rather than just application code.

### Data Topology

```
┌──────────────────────────────────────────────┐
│  ACME Tenant AWS Account                      │
│                                              │
│  Dedicated RDS Postgres (Multi-AZ)           │
│  Dedicated MSK Kafka                         │
│  Dedicated ElastiCache Redis                 │
│  Dedicated ClickHouse                        │
└──────────────────────────────────────────────┘
```

### Helm Values

```yaml
# helm/values-siloed.yaml
mode: siloed
database:
  sharedRds: false
  host: aeos-acme.cluster-abc.us-east-1.rds.amazonaws.com
kafka:
  sharedMsk: false
  bootstrapServers: b-1.aeos-acme.abc.kafka.us-east-1.amazonaws.com:9092
redis:
  sharedElasticache: false
  host: aeos-acme.def.cache.amazonaws.com
clickhouse:
  host: acme.clickhouse.cloud
tenantIsolation: physical
```

---

## Mode 3: On-Premise

### Description

The customer operates Kubernetes (typically OpenShift or vanilla EKS Anywhere), and manages their own Postgres, Kafka, and Redis. FuzeBox ships Helm charts and container images; the customer's ops team runs the platform.

### When to Use

- Air-gapped environments (defense, intelligence community)
- Strict data sovereignty requirements where data cannot leave customer premises
- Phase 3+, available from Day 121

### Customer-Operated Infrastructure

| Component | Customer Provides | FuzeBox Provides |
|---|---|---|
| Kubernetes | Customer-operated (any CNCF-conformant) | Helm charts + container images |
| Postgres | Customer-managed (pg 14+) | Schema migrations (Prisma) |
| Kafka | Customer-managed (2.8+) | Topic creation scripts |
| Redis | Customer-managed (6.2+) | Configuration guidance |
| ClickHouse | Customer-managed (22.8+) | Schema creation scripts |
| TLS | Customer-managed CA | Service mesh config |

### tenant_id Isolation

Same logical isolation as pooled mode. Because on-prem is typically single-tenant (one customer per deployment), the single `tenant_id` covers the entire installation. Multi-tenant on-prem (customer hosts multiple of their own business units) uses the same pooled isolation model.

### Helm Values

```yaml
# helm/values-onprem.yaml
mode: onprem
database:
  sharedRds: false
  host: postgres.customer.internal
  port: 5432
kafka:
  bootstrapServers: kafka.customer.internal:9092
redis:
  host: redis.customer.internal
clickhouse:
  host: clickhouse.customer.internal
tenantIsolation: logical
imageRegistry: customer-registry.internal/aeos
imagePullPolicy: IfNotPresent
```

---

## Cost and Complexity Tradeoffs

| Factor | Pooled | Siloed | On-prem |
|---|---|---|---|
| Infrastructure cost (FuzeBox) | Low — shared across tenants | High — dedicated per tenant | Zero (customer bears infra cost) |
| Operational complexity | Low | Medium — one Terraform workspace per tenant | High — customer ops team dependency |
| Tenant isolation strength | Logical (application-layer) | Physical (separate AWS account) | Physical (customer-premises) |
| Time to provision new tenant | Minutes (seed scripts) | Hours (Terraform apply) | Days–weeks (customer procurement) |
| Compliance posture | SOC 2 shared environment | SOC 2 per-account + isolation report | Customer-certified |
| Data residency | FuzeBox AWS region | FuzeBox AWS region (per-account) | Customer's premises |
| Upgrade cadence | FuzeBox-controlled | FuzeBox-controlled | Requires customer coordination |

## Related Docs

- [multi-tenancy.md](multi-tenancy.md) — tenant_id enforcement rules
- [service-map.md](service-map.md) — service topology per mode
- [infra/CLAUDE.md](../../infra/CLAUDE.md) — Terraform and Helm structure
