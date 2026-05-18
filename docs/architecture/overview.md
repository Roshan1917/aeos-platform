# AEOS Platform Architecture Overview

## What AEOS Is

AEOS (AI Ecosystem Observation System) is FuzeBox's multi-tenant platform for observing, measuring, and governing enterprise AI agent deployments.

**v1 posture: observational.** The platform collects and analyzes telemetry, scores performance, and generates recommendations. It does not intercept or modify agent execution. Runtime enforcement is v2.

## Design Principles

1. **Observe, don't intervene** — v1 is non-blocking in all agent execution paths
2. **API-first** — UI is just one client; LLM-friendly API surface
3. **Open-source commodity, proprietary moat** — Scoring, Ledger, Recommendations, Attestation are the IP; infrastructure is OSS
4. **Vendor-neutral** — supports 5 hyperscalers, 10 frontier model labs, 8 agent platforms, 6 developer frameworks
5. **Tenant-scoped** — no cross-tenant data; anonymized benchmarks only with consent

## Platform Layers

### Six Differentiated Services

```
┌─────────────────────────────────────────────────────────┐
│  Assessment  │  Process    │  Telemetry  │  Intelligence │
│  (CAITO)     │  Discovery  │  (OTel)     │  (Ledger)     │
├──────────────┴─────────────┼─────────────┴───────────────┤
│     Recommendations        │       Governance             │
│     (patterns, templates)  │       (policy, attestation)  │
└────────────────────────────┴─────────────────────────────┘
```

### One Shared Substrate

```
┌────────────────────────────────────────────────────────┐
│          Auth + RBAC + Org Management                  │
│          Agent Identity + Contracts                    │
└────────────────────────────────────────────────────────┘
```

### Three Platform Capabilities (cross-cutting)

| Capability | Technology | Package |
|---|---|---|
| Event Bus + Canonical Schema | MSK Kafka, tenant-scoped | `@aeos/event-bus-client` |
| Semantic Registries (UoP, Process, Agent) | Postgres + REST | `@aeos/registry-client` |
| Connector Substrate | IdP, CRM, ERP, DMS, AI telemetry | TBD per connector |

### Agent Adapter SDK

Build-time tool (not runtime). Generates platform-specific bindings for each agent framework. Lives in `sdk/`. Open-sourced at Day 180.

## Data Flow

```
Agent Execution
     │
     ▼
[Adapter SDK — emits OTel spans with AEOS attributes]
     │
     ▼
[OTel Collector] ──► [LangFuse (span store)]
     │
     ▼
[Telemetry Service] ─► Enriches spans (UoP mapping, process classification)
     │
     ├──► Kafka: telemetry.span.enriched
     │
     ▼
[Intelligence Service] ─► Scores UEF dimensions
     │
     ├──► Writes LedgerRow (Predicted)
     ├──► Reads SoR (Salesforce/SAP) ─► Writes LedgerRow (Actual)
     ├──► Computes Variance ─► Writes LedgerRow (Variance)
     └──► Emits: ledger.variance.detected
          │
          ▼
     [Recommendations] ─► Pattern detection ─► Recommendation records
     [Governance] ─► Policy evaluation ─► Attestation bundles
```

## Physical Architecture

**Two AWS accounts:** `prod` and `non-prod`

**Compute:** Amazon EKS (Kubernetes)
- Namespace `substrate`: Auth service
- Namespace `differentiated`: Six service layer
- Namespace `platform`: ingress, cert-manager, external-secrets, ArgoCD
- Namespace `observability`: Grafana, Prometheus, OTel Collector, LangFuse

**Data plane:**
| Service | Purpose |
|---|---|
| RDS Postgres Multi-AZ | Transactional state (Auth, Assessment, Recommendations, Governance) |
| ClickHouse Cloud | Ledger store, Span store (append-only, high-volume analytics) |
| MSK Kafka | Event bus |
| ElastiCache Redis | Sessions, caches, distributed locks |
| S3 | Documents, attestation bundles |
| AWS KMS | Per-tenant data encryption keys |
| AWS Secrets Manager | Tenant-scoped credentials |

**Network:** Cloudflare → ALB → EKS + NGINX ingress

## 180-Day Plan

| Phase | Days | Milestone |
|---|---|---|
| Phase 0 | 1–15 | Consolidation Sprint — demo.fuzebox.ai wired, Ledger shows real runs |
| Phase 1 | 16–60 | Foundation Hardening — first real tenant, Assessment + Discovery MVS, Agent Adapter SDK (8 adapters) |
| Phase 2 | 61–120 | Multi-Tenant GA — 2nd/3rd tenants, siloed mode, SOC 2 Type 1 |
| Phase 3 | 121–180 | Scale & Certify — on-prem live, 10+ tenants, OSS release, SOC 2 Type 2 window |

See the full architecture doc: `specs/FuzeBox_AEOS_Architecture_Plan_v0_6.docx`
