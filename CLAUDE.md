# AEOS Platform

FuzeBox AEOS — AI Ecosystem Observation System. Multi-tenant, vendor-neutral platform for observing, measuring, and governing enterprise AI agent deployments.

This is the **umbrella repo**: holds infrastructure, shared packages, the Agent Adapter SDK, service templates, and drop-in CLAUDE.md files for new developers.

## Live environments

| Env | Web | ArgoCD | Grafana | LangFuse |
|---|---|---|---|---|
| non-prod (staging) | https://staging.aeos.fuzebox.ai | https://staging-argocd.aeos.fuzebox.ai | https://staging-grafana.aeos.fuzebox.ai | https://staging-langfuse.aeos.fuzebox.ai |
| prod | (not deployed) | — | — | — |

Non-prod cluster: `aeos-non-prod` in AWS account `aeos-non-prod`, region `us-east-1`. EKS 1.30, single managed node group, in-memory OpenFGA. Substrate + web are running; telemetry + recommendations require private PyPI (CodeArtifact) + Python package publish, both pending. See [docs/runbooks/staging-deploy.md](docs/runbooks/staging-deploy.md) for the operator-level flow.

---

## Platform Architecture

### Six Differentiated Services
| Service | Purpose | Repo |
|---|---|---|
| Assessment | CAITO readiness report | separate repo |
| Process Discovery | UoP-to-process mapping | separate repo |
| Telemetry | Span ingestion, classification, enrichment (OTLP/LangFuse) | starts in `services/telemetry/` |
| Intelligence | Economic Ledger, Scoring Engine, BI surface | separate repo |
| Recommendations | Pattern detection, templated recommendations | starts in `services/recommendations/` |
| Governance | Post-hoc evaluation, policy packs, board attestation | separate repo |

> `services/test-generator/` is internal developer tooling for generating test cases. It is not a differentiated product service and does not appear in the six-services taxonomy.

### One Shared Substrate
**Auth + RBAC + Org Management + Agent Identity + Contracts** — lives in `services/substrate/`. Every other service depends on it.

### Three Platform Capabilities (cross-cutting)
1. **Event Bus** — MSK Kafka, tenant-scoped canonical events (`packages/event-bus-client/`)
2. **Semantic Registries** — UoP, Process, Agent (`packages/registry-client/`)
3. **Connector Substrate** — IdP, CRM, ERP, DMS, AI runtime telemetry adapters

### Agent Adapter SDK
Build-time (not runtime) tool that generates platform-specific bindings. Lives in `sdk/`. Open-sourced at Day 180.

---

## Repo Layout

```
aeos-platform/
├── CLAUDE.md                    ← you are here
├── apps/
│   └── web/                     ← React/Next web app — deployed to staging.aeos.fuzebox.ai
├── packages/                    ← shared npm + PyPI packages
│   ├── canonical-schema/        ← @aeos/canonical-schema — all shared domain types (PATENT-ADJACENT)
│   ├── auth-client/             ← @aeos/auth-client — JWT middleware + RBAC + agent identity
│   ├── event-bus-client/        ← @aeos/event-bus-client — Kafka producer/consumer
│   ├── registry-client/         ← @aeos/registry-client — UoP/Process/Agent registries
│   ├── telemetry-sdk/           ← @aeos/telemetry-sdk — OTEL tracer wrapper
│   └── testing/                 ← @aeos/testing — shared fixtures, mocks
├── services/
│   ├── _template-ts/            ← TypeScript service scaffold — copy to start a new TS service
│   ├── _template-py/            ← Python service scaffold — copy to start a new Python service
│   ├── substrate/               ← Auth + RBAC service
│   ├── telemetry/               ← Telemetry service (Python — CI build skipped, see Infrastructure)
│   ├── recommendations/         ← Recommendations service (Python — CI build skipped, see Infrastructure)
│   └── test-generator/          ← Internal test-case generator (developer tooling, not a differentiated service)
├── templates/
│   ├── new-service-repo-ts/     ← Clone this to bootstrap a SEPARATE TypeScript service repo
│   └── new-service-repo-py/     ← Clone this to bootstrap a SEPARATE Python service repo
├── infra/
│   ├── terraform/               ← All AWS infrastructure
│   └── helm/                    ← Platform + observability Helm charts
├── sdk/                         ← Agent Adapter SDK
├── local-dev/                   ← docker-compose + seed scripts
│   └── agent-samples/           ← Runnable demo agents emitting AEOS spans (anthropic-quote-agent, lead-qualification-flow)
├── docs/
│   ├── architecture/            ← ADRs, canonical data model, service map
│   └── guides/                  ← How-to guides for consuming shared components
└── specs/                       ← Source-of-truth specification documents
```

---

## Deployment Modes

Three modes, one codebase — different Helm values per mode:

| Mode | Description | When |
|---|---|---|
| **Pooled multi-tenant** | Shared EKS cluster, logical tenant isolation via tenant_id | Default (non-prod + prod) |
| **Siloed single-tenant** | Dedicated AWS account per tenant, full isolation | Enterprise customers (Phase 2+) |
| **On-premise** | Customer-operated Kubernetes, customer-managed data services | Phase 3+ |

See [docs/architecture/deployment-modes.md](docs/architecture/deployment-modes.md).

---

## Getting Started (New Developer)

### Prerequisites
- Node 20+ (`nvm use 20`)
- pnpm 9+ (`npm install -g pnpm@9`)
- Docker + Docker Compose
- AWS CLI v2 (configured for non-prod account)
- kubectl + helm

### Install
```bash
git clone git@github.com:fuzebox/aeos-platform.git
cd aeos-platform
pnpm install
```

### Start local stack
```bash
cd local-dev
cp .env.example .env          # fill in any local overrides
docker-compose up -d
```
This starts: Kafka (MSK-compatible), Postgres, Redis, LangFuse, LocalStack (S3/KMS).

### Seed the dev environment
```bash
cd local-dev
./seed/kafka-topics.sh        # creates tenant-scoped Kafka topics
pnpm tsx seed/seed-tenant.ts  # creates dev tenant + RBAC roles
pnpm tsx seed/seed-registries.ts  # populates UoP/Process/Agent registries
```

### Run a service
```bash
cd services/substrate
cp .env.example .env
pnpm dev
```

See [docs/runbooks/local-dev-setup.md](docs/runbooks/local-dev-setup.md) for full walkthrough.

---

## Starting a New Service

### Path A — Add a folder in `services/` (early-stage or contractor-owned)

Use when: early-stage, evolving alongside shared packages, or contractor team that hasn't established independent ownership yet.

```bash
# TypeScript service
cp -r services/_template-ts services/my-new-service
cd services/my-new-service

# Python service
cp -r services/_template-py services/my-new-service
cd services/my-new-service
```

Then:
1. Fill in `CLAUDE.md` (service name, purpose, boundaries)
2. Update `package.json` or `pyproject.toml` with the real service name
3. Add a Postgres service in `local-dev/docker-compose.yml` if you need a dedicated DB
4. Add a seed script in `local-dev/seed/`

Full guide: [docs/guides/new-service-in-repo.md](docs/guides/new-service-in-repo.md)

### Path B — Create a separate repo (stable, team-owned)

Use when: stable API contract, dedicated team/contractor group owns it, distinct release cadence.

```bash
# TypeScript
git clone git@github.com:fuzebox/aeos-platform.git /tmp/aeos-platform
cp -r /tmp/aeos-platform/templates/new-service-repo-ts aeos-my-service
cd aeos-my-service && git init

# Python
cp -r /tmp/aeos-platform/templates/new-service-repo-py aeos-my-service
```

Then:
1. Fill in `CLAUDE.md`
2. Configure npm access to `@aeos/*` packages: see [docs/guides/new-service-separate-repo.md](docs/guides/new-service-separate-repo.md)
3. Pin `@aeos/*` package versions from latest published release
4. Register the new repo with the platform team (Slack: #aeos-platform)

Full guide: [docs/guides/new-service-separate-repo.md](docs/guides/new-service-separate-repo.md)

---

## Shared Components Quick Reference

| Component | npm Package | PyPI Package | CLAUDE.md |
|---|---|---|---|
| Canonical types | `@aeos/canonical-schema` | `aeos-canonical-schema` | [packages/canonical-schema/CLAUDE.md](packages/canonical-schema/CLAUDE.md) |
| Auth + RBAC | `@aeos/auth-client` | `aeos-auth-client` | [packages/auth-client/CLAUDE.md](packages/auth-client/CLAUDE.md) |
| Event Bus | `@aeos/event-bus-client` | `aeos-event-bus-client` | [packages/event-bus-client/CLAUDE.md](packages/event-bus-client/CLAUDE.md) |
| Registries | `@aeos/registry-client` | `aeos-registry-client` | [packages/registry-client/CLAUDE.md](packages/registry-client/CLAUDE.md) |
| OTEL Telemetry | `@aeos/telemetry-sdk` | `aeos-telemetry-sdk` | [packages/telemetry-sdk/CLAUDE.md](packages/telemetry-sdk/CLAUDE.md) |
| Test utilities | `@aeos/testing` | — | [packages/testing/CLAUDE.md](packages/testing/CLAUDE.md) |

---

## Infrastructure

All AWS infra is Terraform — `infra/terraform/`.

Two AWS accounts:
- `non-prod`: dev + staging environments
- `prod`: production

Kubernetes: Amazon EKS. Four namespaces: `differentiated`, `substrate`, `platform`, `observability`.

GitOps: ArgoCD watches main branches. CI: GitHub Actions.

Infra changes: open a PR, CI runs `terraform plan`. Merge triggers `terraform apply` via CI.

See [infra/CLAUDE.md](infra/CLAUDE.md).

### Python service CI status (temporary)

Container image builds for `services/telemetry` and `services/recommendations` are intentionally **skipped** in [.github/workflows/build-images.yml](.github/workflows/build-images.yml) until private PyPI (CodeArtifact) is provisioned and the `aeos-*` Python packages are published. Substrate (TS), `apps/web`, and `services/test-generator` build normally.

If you find a "missing" telemetry or recommendations image in ECR, this is the reason — it's not a CI failure. See [infra/CLAUDE.md](infra/CLAUDE.md) and [docs/runbooks/staging-deploy.md](docs/runbooks/staging-deploy.md) for the cutover plan.

---

## Working with Multiple Claude Code Agents

Two or more Claude Code sessions in this repo will collide unless you isolate them. Follow this protocol whenever you start a new task — including the first time you open the repo after switching context.

### Before the first edit

Run these and read the output before touching any file:

```bash
git rev-parse --abbrev-ref HEAD                    # current branch
gh pr list --head $(git branch --show-current)     # PR open on it?
git status --short                                  # uncommitted work?
```

If anything surprises you — wrong branch, an open PR scoped to different work, uncommitted changes you did not make — **stop**. Do not commit on top. Branch from `main` for new, unrelated work:

```bash
git fetch origin main
git checkout main && git pull --ff-only
git checkout -b <topic>/<short-description>
```

### Running two agents in parallel

Never share a working tree. The second agent uses `git worktree`:

```bash
# from the primary clone
git worktree add ../aeos-platform-<topic> -b <topic>/<short-description> origin/main
# open a fresh Claude Code session in ../aeos-platform-<topic>
```

Each worktree has its own checked-out branch and working directory, so `git status`, `git add`, file edits, and `pnpm install` outputs do not collide. Clean up when done:

```bash
git worktree remove ../aeos-platform-<topic>
```

### Pre-commit sanity check

- Stage explicit paths only — never `git add -A` or `git add .`. Two agents in adjacent worktrees each running `git add -A` is the most common way unrelated work ends up on the wrong branch.
- Before `git commit`, run `git diff --cached --stat` and verify every staged file belongs to the current task. Unstage strays.
- If your edits land on a branch that already has an open PR for unrelated work, you started in the wrong place — go back to "Before the first edit."

---

## Key Non-Negotiables

These are hard rules — not guidelines.

1. **`tenant_id` on everything.** Every DB row, every cache key, every Kafka event carries `tenant_id`. No exceptions.

2. **v1 is observational only.** No runtime intervention in agent execution paths. The platform observes and reports; it does not block or modify in v1.

3. **`LedgerRow` is append-only.** No `UPDATE` or `DELETE` on LedgerRow records. Compensating rows only.

4. **Patent-adjacent types require CTO review.** `LedgerRow`, `Boundary`, `UoP`, `Attestation` — do not add fields, rename fields, or restructure these types without talking to Danny Goldstein first. See [docs/architecture/canonical-data-model.md](docs/architecture/canonical-data-model.md).

5. **No cross-tenant data access.** The platform infrastructure enforces this at the DB and Kafka layers. Application code must also filter by `tenant_id` on every query.

6. **Auth on every endpoint.** Every inbound HTTP request must pass through `requireAuth()`. No unauthenticated endpoints except `/healthz` and `/readyz`.

---

## Active Research Spikes

@research/onet-spike/CLAUDE.md

---

## Contacts

| Role | Person | Slack |
|---|---|---|
| CTO / Architecture / Patent | Danny Goldstein | @danny |

Routing channels (no named owner yet — escalate to CTO if blocked):
- Platform / Infra: `#aeos-platform`
- Auth / Substrate: `#aeos-substrate`
- Security: `#aeos-security`
- On-call: PagerDuty rotation
