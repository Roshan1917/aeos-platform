# AEOS Platform

**AI Ecosystem Observation System** — FuzeBox's multi-tenant platform for observing, measuring, and governing enterprise AI agent deployments.

> v1 posture: observational. No runtime intervention. Run-time enforcement is v2.

## What it does

AEOS sits as a boundary-layer observer across your enterprise AI agent stack. It ingests telemetry from 20+ agent platforms and model providers, builds an Economic Ledger of predicted vs. actual business outcomes, scores performance across 8 dimensions, and generates attestation bundles for board-level regulatory compliance (EU AI Act, ISO 42001, SOC 2).

## Deployed environments

| Env | Web | Substrate API | ArgoCD | Grafana | LangFuse |
|---|---|---|---|---|---|
| non-prod (staging) | https://staging.aeos.fuzebox.ai | https://staging.aeos.fuzebox.ai/api/substrate | https://staging-argocd.aeos.fuzebox.ai | https://staging-grafana.aeos.fuzebox.ai | https://staging-langfuse.aeos.fuzebox.ai |
| prod | _not deployed_ | — | — | — | — |

Cluster: EKS `aeos-non-prod` in AWS account `aeos-non-prod` (`us-east-1`). Substrate + web + LangFuse run today; telemetry + recommendations are gated on private PyPI (CodeArtifact). See [docs/runbooks/staging-deploy.md](docs/runbooks/staging-deploy.md).

## Seeded users

Same bootstrap credentials work in **local dev** and **staging** — both are seeded by `local-dev/seed/seed-tenant.ts` against the dev tenant.

| Email | Password | Roles | Tenant slug |
|---|---|---|---|
| `admin@dev-corp.local` | `DevPassword1234!` | `owner` | `dev-corp` |
| `analyst@dev-corp.local` | `DevPassword1234!` | `member`, `analyst` | `dev-corp` |
| `viewer@dev-corp.local` | `DevPassword1234!` | `member` | `dev-corp` |

Local login: http://localhost:5173/login. Staging login: https://staging.aeos.fuzebox.ai/login. Local-dev passwords only — never reuse for prod.

## For developers

This repo is the platform umbrella. If you're building a sub-service, start with [CLAUDE.md](CLAUDE.md).

## Local development

**Recommended: one-shot script.** [`local-dev/fresh-start.sh`](local-dev/fresh-start.sh) runs the entire zero-to-seeded flow — compose up, Prisma + Alembic migrations, OpenFGA seed (writes IDs into `local-dev/.env`), substrate restart, dev tenant + registries seed, Kafka topics. Re-runnable; pass `--reset` to wipe Postgres + Kafka volumes first.

```bash
git clone git@github.com:fuzebox-ai/aeos-platform.git && cd aeos-platform
pnpm install
cd local-dev && cp .env.example .env
./fresh-start.sh           # add --reset for clean slate
```

Pre-reqs: pnpm 9+, Docker Desktop running, `npx` on PATH. Refuses to run if `kubectl` is holding `localhost:8080` (would corrupt staging OpenFGA).

Login http://localhost:5173/login as `admin@dev-corp.local` / `DevPassword1234!` (tenant `dev-corp`).

Manual paths below for when you need to debug a step or run services on host. Full step-by-step in [docs/runbooks/local-dev-setup.md](docs/runbooks/local-dev-setup.md).

### A. Full stack in Docker (`--profile services`)

Everything — infra + all five services + web — runs in containers. Slower iteration (rebuild on code change) but matches the deployed shape and skips per-service language toolchain setup.

```bash
git clone git@github.com:fuzebox-ai/aeos-platform.git && cd aeos-platform
pnpm install                              # only needed for seed scripts
cd local-dev && cp .env.example .env

# 1. Build + start infra and services together
docker compose --profile services up -d --build

# 2. Run migrations (one-time, after first up; idempotent)
DATABASE_URL='postgresql://aeos:aeos_dev_password@localhost:5432/aeos?schema=substrate' \
  npx -p prisma@5.13.0 prisma migrate deploy --schema=../services/substrate/prisma/schema.prisma
DATABASE_URL='postgresql://aeos:aeos_dev_password@localhost:5432/aeos?schema=test_generator' \
  npx -p prisma@5.13.0 prisma migrate deploy --schema=../services/test-generator/prisma/schema.prisma
docker compose run --rm --no-deps \
  -e DATABASE_URL='postgresql://aeos:aeos_dev_password@postgres:5432/aeos' \
  -e DATABASE_SCHEMA=telemetry --entrypoint alembic telemetry upgrade head
docker compose run --rm --no-deps \
  -e DATABASE_URL='postgresql://aeos:aeos_dev_password@postgres:5432/aeos' \
  -e DATABASE_SCHEMA=recommendations -e SUBSCRIBE_TENANT_IDS= \
  --entrypoint alembic recommendations upgrade head

# 3. Seed OpenFGA — copy the printed STORE/MODEL IDs into local-dev/.env
cd .. && pnpm tsx local-dev/seed/seed-openfga.ts && cd local-dev

# 4. Restart so substrate picks up the OpenFGA IDs
docker compose --profile services up -d

# 5. Seed dev tenant + registries
cd .. && pnpm tsx local-dev/seed/seed-tenant.ts && pnpm tsx local-dev/seed/seed-registries.ts
```

Web: http://localhost:5173. Substrate: 3002. Telemetry: 3003. Recommendations: 3004. Test-generator: 3005. LangFuse: 3001. OpenFGA HTTP: 8080.

### B. Infra in Docker, services on host (`pnpm dev` / uvicorn)

Faster iteration via hot-reload. Default `docker compose up` (no profile) brings only Kafka/Postgres/Redis/LangFuse/OpenFGA/OTel/LocalStack; you run each service from its own dir.

```bash
# 1. Tools
nvm install 20 && nvm use 20      # Node 22+ has known Prisma 5 incompatibilities
npm install -g pnpm@9
# Docker Desktop, pyenv (3.11+) — see runbook

# 2. Install + bring up backing services
git clone git@github.com:fuzebox-ai/aeos-platform.git && cd aeos-platform
pnpm install
cd local-dev && cp .env.example .env && docker compose up -d && cd ..

# 3. Seed OpenFGA, copy the printed IDs into services/substrate/.env
pnpm tsx local-dev/seed/seed-openfga.ts

# 4. Substrate (Node, port 3002)
cd services/substrate && cp .env.example .env
# paste the OPENFGA_STORE_ID / OPENFGA_MODEL_ID into .env, then:
pnpm prisma migrate deploy && pnpm prisma generate && pnpm dev &
cd ../..

# 5. Seed dev tenant + registries
pnpm tsx local-dev/seed/seed-tenant.ts
pnpm tsx local-dev/seed/seed-registries.ts

# 6. test-generator (Node, port 3005). Set ANTHROPIC_API_KEY in .env first.
cd services/test-generator && cp .env.example .env
pnpm prisma migrate deploy && pnpm prisma generate && pnpm dev &
cd ../..

# 7. telemetry (Python, port 3003)
cd services/telemetry && python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]" && cp .env.example .env
alembic upgrade head && uvicorn src.main:app --reload --port 3003 &
deactivate && cd ../..

# 8. web (port 5173)
cd apps/web && pnpm dev
```

Login at http://localhost:5173/login with any of the [seeded users](#seeded-users) above (tenant slug `dev-corp`).

### Database layout

Local stack runs **one** Postgres container with three databases:
- `aeos` — application data, one schema per service (`substrate`, `telemetry`, `recommendations`, `test_generator`, `governance`). Each service connects with its own `search_path` (`?schema=` for Prisma; `DATABASE_SCHEMA` env for Python).
- `langfuse` — owned by the LangFuse container.
- `openfga` — owned by the OpenFGA container.

Schemas + roles are provisioned by [local-dev/init-db.sql](local-dev/init-db.sql) on first init. Wipe with `docker compose --profile services down -v` to reset.

**All four services share one `AUTH_JWT_SECRET`.** The `.env.example` files ship with the same value; if you regenerate one, regenerate all of them, or every authenticated route 401s.

## Documentation index

### Top-level
- [CLAUDE.md](CLAUDE.md) — Repo orientation: layout, the six differentiated services, deployment modes, non-negotiables.
- [docs/plan.md](docs/plan.md) — Living implementation plan tracking what's scaffolded vs. pending.

### Architecture (`docs/architecture/`)
- [overview.md](docs/architecture/overview.md) — What AEOS is and isn't (v1 = observe, v2 = enforce).
- [service-map.md](docs/architecture/service-map.md) — The six differentiated services + the substrate + the three platform capabilities.
- [canonical-data-model.md](docs/architecture/canonical-data-model.md) — Source-of-truth types in `packages/canonical-schema/` and which ones are patent-adjacent.
- [multi-tenancy.md](docs/architecture/multi-tenancy.md) — How `tenant_id` flows through DB, Kafka, and cache layers in pooled vs. siloed mode.
- [deployment-modes.md](docs/architecture/deployment-modes.md) — Pooled multi-tenant, siloed single-tenant, and on-premise modes from one codebase.
- [dns-and-tls.md](docs/architecture/dns-and-tls.md) — Cloudflare → NLB → ingress-nginx traffic path; external-dns + Origin CA cert provisioning.
- [adr/ADR-001-polyrepo-default.md](docs/architecture/adr/ADR-001-polyrepo-default.md) — Why services graduate to their own repos by default.
- [adr/ADR-002-clickhouse-ledger.md](docs/architecture/adr/ADR-002-clickhouse-ledger.md) — Why the Economic Ledger lives in ClickHouse.
- [adr/ADR-003-kafka-canonical-bus.md](docs/architecture/adr/ADR-003-kafka-canonical-bus.md) — Why MSK Kafka is the canonical event bus.

### Guides — consuming shared platform components (`docs/guides/`)
- [consuming-auth.md](docs/guides/consuming-auth.md) — How to wire `@aeos/auth-client` / `aeos-auth-client` into a service for JWT + RBAC.
- [consuming-event-bus.md](docs/guides/consuming-event-bus.md) — Topic naming convention and how to publish/subscribe via the event-bus client.
- [consuming-registries.md](docs/guides/consuming-registries.md) — Reading the UoP, Process, and Agent registries via the registry client.
- [ledgerrow-contract.md](docs/guides/ledgerrow-contract.md) — The append-only `LedgerRow` invariant and the compensating-row pattern.

### Guides — adding services (`docs/guides/`)
- [new-service-in-repo.md](docs/guides/new-service-in-repo.md) — When to add a service as a folder under `services/` and how.
- [new-service-separate-repo.md](docs/guides/new-service-separate-repo.md) — When to spin a service into its own repo and how to wire it back in.

### Guides — operating (`docs/guides/`)
- [operating-telemetry.md](docs/guides/operating-telemetry.md) — On-call runbook for the Telemetry service (`POST /v1/spans`, enrichment, Kafka emit).
- [operating-recommendations.md](docs/guides/operating-recommendations.md) — On-call runbook for the Recommendations service (variance event consumer, template engine).
- [operating-web.md](docs/guides/operating-web.md) — Running the reference web app locally or pointed at non-local backends.
- [test-case-generator.md](docs/guides/test-case-generator.md) — Internal QA tool that produces synthetic agent traces flowing through the real Telemetry pipeline.

### Runbooks (`docs/runbooks/`)
- [local-dev-setup.md](docs/runbooks/local-dev-setup.md) — Long-form version of the quickstart above; the source of truth for clone-and-run.
- [staging-deploy.md](docs/runbooks/staging-deploy.md) — How non-prod is deployed today: EKS, ArgoCD, ECR, ingress, manual prereqs.

### Component-internal docs
Each package, service, and SDK adapter has its own `CLAUDE.md` (or `README.md`) with API surface, env vars, and graduation status. Start from the directory:
- [packages/](packages/) — `canonical-schema`, `auth-client`, `event-bus-client`, `registry-client`, `telemetry-sdk`, `testing`.
- [services/](services/) — `substrate`, `telemetry`, `recommendations`, `test-generator`, plus `_template-ts` / `_template-py` scaffolds.
- [apps/web/](apps/web/) — Reference React + Vite frontend.
- [sdk/](sdk/) — Agent Adapter SDK (build-time tool) plus per-platform adapters under `sdk/adapters/` (`bedrock`, `cowork`, `openai`).
- [infra/](infra/) — Terraform modules, Helm charts, ArgoCD app manifests, bootstrap scripts.

### Specs

Architecture and requirements documents are in [specs/](specs/).

## Status

Phase 0 — Consolidation Sprint. See [docs/architecture/overview.md](docs/architecture/overview.md) for the 180-day plan.
