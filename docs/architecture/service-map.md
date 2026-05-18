# AEOS Service Map

## Overview

AEOS consists of six differentiated services, one shared substrate, and three cross-cutting platform capabilities.

## Services

| Service | Purpose | Language | Location | k8s Namespace | Kafka Events Produced | Kafka Events Consumed |
|---|---|---|---|---|---|---|
| **Substrate** | Auth + RBAC + Org Management + Agent Identity + Contracts | TypeScript | `services/substrate/` (in-repo) | `substrate` | `aeos.{tid}.auth.token_issued`, `aeos.{tid}.auth.agent_contract_created` | — |
| **Assessment** | CAITO readiness report — scores org AI readiness across 5 dimensions | TypeScript | separate repo (`aeos-assessment`) | `differentiated` | `aeos.{tid}.assessment.report_completed` | `aeos.{tid}.auth.org_created` |
| **Process Discovery** | Maps Units of Potential (UoP) to business processes | TypeScript | separate repo (`aeos-process-discovery`) | `differentiated` | `aeos.{tid}.registry.uop_mapped`, `aeos.{tid}.registry.process_updated` | `aeos.{tid}.assessment.report_completed` |
| **Telemetry** | OTel span ingestion, classification, and enrichment via LangFuse | Python | `services/telemetry/` (in-repo, **implemented Phase 12**, graduates ~Day 45) | `differentiated` | `aeos.{tid}.telemetry.span.enriched` | — |
| **Intelligence** | Economic Ledger + UEF Scoring Engine + BI surface | TypeScript | separate repo (`aeos-intelligence`) | `differentiated` | `aeos.{tid}.ledger.row_written`, `aeos.{tid}.ledger.variance_detected` | `aeos.{tid}.telemetry.span.enriched`, `aeos.{tid}.registry.uop_mapped` |
| **Recommendations** | Pattern detection + templated recommendation generation | Python | `services/recommendations/` (in-repo, **implemented Phase 13**, graduates ~Day 90) | `differentiated` | `aeos.{tid}.recommendations.created`, `aeos.{tid}.recommendations.status_changed` | `aeos.{tid}.ledger.variance.detected` |
| **Governance** | Post-hoc policy evaluation + policy packs + board attestation bundles | TypeScript | separate repo (`aeos-governance`) | `differentiated` | `aeos.{tid}.governance.attestation_generated` | `aeos.{tid}.ledger.row_written`, `aeos.{tid}.recommendations.status_changed` |

`{tid}` = tenant_id placeholder. See [multi-tenancy.md](multi-tenancy.md) for topic naming details.

## Platform Capabilities (Cross-Cutting)

| Capability | Technology | Package | Purpose |
|---|---|---|---|
| **Event Bus** | MSK Kafka, tenant-scoped topics | `@aeos/event-bus-client` / `aeos-event-bus-client` | Async decoupled communication between services |
| **Semantic Registries** | Postgres + REST API (in Substrate) | `@aeos/registry-client` / `aeos_registry_client` | UoP, Process, and Agent registries |
| **Connector Substrate** | Pluggable adapters | TBD per connector | IdP, CRM, ERP, DMS, and AI runtime telemetry adapters |
| **Reference Web App** | React + Vite + TypeScript SPA, served via nginx | `apps/web/` (in-repo, **implemented Phase 14**) | Internal demo + reference UI for substrate, telemetry, and recommendations |

## Service Dependency Diagram

```
                        ┌─────────────────────────────────┐
                        │           SUBSTRATE              │
                        │  Auth · RBAC · Org · Contracts   │
                        │  Registries: UoP, Process, Agent │
                        └──────────────┬──────────────────┘
                                       │  (all services depend on substrate)
          ┌────────────────────────────┼──────────────────────────┐
          │                            │                          │
          ▼                            ▼                          ▼
   ┌────────────┐             ┌──────────────────┐       ┌──────────────────┐
   │ Assessment │             │ Process Discovery│       │    Telemetry     │
   │  (CAITO)   │             │  (UoP → Process) │       │  (OTel → spans)  │
   └─────┬──────┘             └────────┬─────────┘       └────────┬─────────┘
         │                             │                           │
         │ assessment.report_completed │ registry.uop_mapped       │ telemetry.span_enriched
         │                             │                           │
         └──────────────────┐          │           ┌───────────────┘
                            ▼          ▼           ▼
                        ┌──────────────────────────────┐
                        │         INTELLIGENCE          │
                        │   Ledger · Scoring · BI       │
                        └──────────────┬───────────────┘
                                       │
                     ┌─────────────────┴─────────────────┐
                     │ ledger.variance_detected            │ ledger.row_written
                     ▼                                    ▼
             ┌─────────────────┐               ┌──────────────────┐
             │ Recommendations │               │   Governance      │
             │ (patterns)      │               │ (policy · attest) │
             └─────────────────┘               └──────────────────┘
```

## Event Bus Topology

All inter-service communication uses Kafka via `@aeos/event-bus-client`. Services do not call each other's HTTP APIs for async workflows.

Topic naming convention: `aeos.{tenant_id}.{domain}.{event_type}`

| Domain | Event Types |
|---|---|
| `auth` | `token_issued`, `agent_contract_created` |
| `assessment` | `report_completed` |
| `registry` | `uop_mapped`, `process_updated`, `agent_registered` |
| `telemetry` | `span.enriched` |
| `ledger` | `row.written`, `variance.detected` |
| `recommendations` | `created`, `status_changed` |
| `governance` | `attestation_generated` |

## Registry Write Permissions

Each registry has exactly one authoritative writer. All other services are read-only.

| Registry | Authoritative Writer | Readers |
|---|---|---|
| **UoP Registry** | Process Discovery | Telemetry, Intelligence, Recommendations |
| **Process Registry** | Process Discovery | Assessment, Intelligence, Governance |
| **Agent Registry** | Substrate (via Agent Identity API) | All services |

Registry reads: use `@aeos/registry-client` — see [docs/guides/consuming-registries.md](../guides/consuming-registries.md).

## Related Docs

- [overview.md](overview.md) — Platform architecture overview and data flow
- [multi-tenancy.md](multi-tenancy.md) — Tenant isolation model
- [deployment-modes.md](deployment-modes.md) — Pooled / Siloed / On-prem topology
- [adr/ADR-003-kafka-canonical-bus.md](adr/ADR-003-kafka-canonical-bus.md) — Why Kafka
