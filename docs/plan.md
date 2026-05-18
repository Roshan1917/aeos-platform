# AEOS Platform — Implementation Plan

Tracks scaffold progress for the umbrella repo. Update checkboxes as work completes.

---

## Current status (2026-05-06)

**Non-prod is live.** EKS cluster `aeos-non-prod` (us-east-1) reconciling via ArgoCD. Web + substrate + test-generator + telemetry + LangFuse v3 served behind Cloudflare at `https://staging.aeos.fuzebox.ai` (LangFuse on `https://staging-langfuse.aeos.fuzebox.ai`). Recommendations remains gated — Dockerfile is ready but its consumer is blocked on the Intelligence service (variance-event producer), not on Python build.

End-to-end smoke confirmed: browser login → JWT → registries → test-case generate + execute (synthetic + live), with the test-generator UI re-wired into the web app. See [docs/runbooks/staging-deploy.md](runbooks/staging-deploy.md).

Telemetry's Python image now builds in CI via an interim **vendored-packages** path: the Dockerfile runs from a repo-root build context and `pip install`s the in-repo `packages/<pkg>/src/python/` directories directly. CodeArtifact remains the documented long-term replacement (Outstanding section); when it lands, the COPY+install hunks in the Dockerfile are swapped for `--extra-index-url` and the matrix entry stays unchanged.

Outstanding to graduate non-prod into a self-service path: CodeArtifact + Python image build (replaces the interim path above), security-scan Trivy failures, log shipping to CloudWatch / Loki.

---

## 🔐 Auth Priority Track

All other services are blocked on substrate. Complete this track before resuming other phases.

### A. Infrastructure prerequisites
- [x] Add OpenFGA to `local-dev/docker-compose.yml` (RBAC engine) — `openfga:v1.5.3` + dedicated Postgres
- [x] Add OpenFGA model seed to `local-dev/seed/` — `seed-openfga.ts` (creates store, writes auth model, bootstraps dev tenant tuples)

### B. Substrate scaffold
- [x] `services/substrate/package.json` — `@aeos/substrate`, Prisma + OpenFGA + bcrypt + jsonwebtoken deps
- [x] `services/substrate/prisma/schema.prisma` — tenants, users, sessions, agents, agent_contracts, uops, processes, rbac_audit_log
- [x] `services/substrate/src/config.ts` — Zod env schema (DB, JWT, OpenFGA, Kafka, signing key)
- [x] `services/substrate/.env.example`
- [x] `services/substrate/Dockerfile`
- [x] `services/substrate/helm/Chart.yaml` + `helm/values.yaml` + full templates (deployment, service, externalsecret, hpa, sa)
- [x] `pnpm prisma migrate dev` — first migration applied locally + against non-prod RDS via initContainer (`npx prisma migrate deploy`)

### C. Substrate API implementation
- [x] `POST /v1/auth/token` — issue JWT from email+password
- [x] `POST /v1/auth/refresh` — rotate refresh token
- [x] `POST /v1/tenants`, `GET /v1/tenants/:id`, `GET/PATCH /v1/tenants/:id/settings`
- [x] `POST /v1/users`, `GET /v1/users/:id`, `GET /v1/users`
- [x] `POST /v1/rbac/check` — OpenFGA relationship check
- [x] `POST /v1/rbac/write` — write OpenFGA tuples (admin only) + audit log
- [x] `POST /v1/agents`, `GET /v1/agents/:id`, `GET /v1/agents`
- [x] `POST /v1/agent-contracts`, `GET /v1/agent-contracts/:id`, `POST /v1/agent-contracts/:id/verify`
- [x] Registry proxy: `GET/POST /v1/tenants/:id/uops`, `/processes`, `/agents`
- [x] `POST /internal/sign/ledger-row` + `/attestation` (HMAC-SHA256 local dev; Ed25519 TODO for prod)

### D. Auth client — real implementation
- [x] `packages/auth-client/src/middleware/express.ts` — JWKS (RS256/ES256) for prod + HS256 HMAC fallback for local dev; `AUTH_JWKS_URI` env selects mode
- [x] `packages/auth-client/src/rbac.ts` — real HTTP call to `POST /v1/rbac/check`
- [x] `packages/auth-client/src/agent-identity.ts` — real HTTP call to `POST /v1/agent-contracts/:id/verify`
- [x] Python: same real implementations in `packages/auth-client/src/python/` (middleware supports JWKS via `PyJWT[cryptography]`)
- [x] `services/substrate/src/api/auth.ts` — `GET /.well-known/jwks.json` endpoint (empty in HMAC mode; exports JWK public key when SIGNING_PRIVATE_KEY_B64 set)

### E. Seed updates
- [x] `local-dev/seed/seed-tenant.ts` — bootstrap platform_admin JWT (HS256 via Node crypto), calls `POST /v1/tenants` + creates dev users via `POST /v1/users`
- [x] `local-dev/seed/seed-registries.ts` — logs in as dev admin, calls substrate registry proxy (`/v1/tenants/:id/uops|agents|processes`)

---

## Phase 0 — Repo Bootstrap

- [x] `git init` + initial commit (specs/ only)
- [x] `package.json` (pnpm workspaces root), `pnpm-workspace.yaml`, `tsconfig.base.json`, `.prettierrc`, `.eslintrc.base.js`, `.gitignore`
- [x] Root `CLAUDE.md`
- [x] `README.md`

---

## Phase 1 — Canonical Schema Package

- [x] `packages/canonical-schema/package.json` (`@aeos/canonical-schema`)
- [x] `packages/canonical-schema/pyproject.toml` (`aeos-canonical-schema`)
- [x] TS types: `tenant.ts`, `uop.ts`, `agent.ts`, `agent-contract.ts`, `boundary.ts`, `span.ts`, `ledger-row.ts`, `recommendation.ts`, `attestation.ts`
- [x] Canonical events: `telemetry-events.ts`, `ledger-events.ts`, `governance-events.ts`, `registry-events.ts`
- [x] Build script to auto-generate Python equivalents from TS types (`packages/canonical-schema/scripts/generate-python.ts` using `ts-json-schema-generator`; wired into `pnpm build:python`)
- [x] `packages/canonical-schema/CLAUDE.md`
- [x] `docs/architecture/canonical-data-model.md`

---

## Phase 2 — Shared Client Packages

### `packages/auth-client/` (`@aeos/auth-client`)
- [x] TS: `requireAuth()` Express middleware, `checkPermission()`, `verifyAgentContract()`
- [x] Python: `require_auth` FastAPI dependency, `check_permission()`, `verify_agent_contract()`
- [x] `packages/auth-client/CLAUDE.md`
- [x] Real implementation (JWKS + HMAC dual-mode — done in Auth Priority Track D)

### `packages/event-bus-client/` (`@aeos/event-bus-client`)
- [x] TS: `createProducer()`, `createConsumer()`, tenant-scoped topic naming
- [x] Python equivalents (`aeos_event_bus_client` — aiokafka async producer/consumer, SCRAM-SHA-512 + SSL)
- [x] `packages/event-bus-client/CLAUDE.md`

### `packages/registry-client/` (`@aeos/registry-client`)
- [x] TS: `UoPRegistry`, `ProcessRegistry`, `AgentRegistry`
- [x] Python equivalents (`aeos_registry_client` — httpx async, UoPRegistry/ProcessRegistry/AgentRegistry)
- [x] `packages/registry-client/CLAUDE.md`

### `packages/telemetry-sdk/` (`@aeos/telemetry-sdk`)
- [x] TS: `initTracing()`, `getTracer()`, `SpanAttributes`
- [x] Python equivalents (`aeos_telemetry_sdk` — OTEL SDK, BatchSpanProcessor, OTLP HTTP exporter)
- [x] `packages/telemetry-sdk/CLAUDE.md`

### `packages/testing/` (`@aeos/testing`)
- [x] Mock auth server
- [x] Canonical type factories (`packages/testing/src/fixtures/index.ts`)
- [x] Mock Kafka producer/consumer
- [x] Mock registry (UoP, Process, Agent)
- [x] `packages/testing/CLAUDE.md`

---

## Phase 3 — Local Development Environment

- [x] `local-dev/docker-compose.yml` — Kafka KRaft, Postgres 16, Redis 7, LangFuse 2, LocalStack, OTel Collector
- [x] `local-dev/docker-compose.override.yml` — dev port overrides
- [x] `local-dev/seed/kafka-topics.sh`
- [x] `local-dev/seed/seed-registries.ts`
- [x] `local-dev/seed/seed-tenant.ts`
- [x] `local-dev/.env.example`
- [x] `docs/runbooks/local-dev-setup.md`

---

## Phase 4 — Service Templates

### `services/_template-ts/` (TypeScript)
- [x] `src/main.ts` — Express + `requireAuth` + OTEL + graceful shutdown
- [x] `src/config.ts` — Zod env schema
- [x] `src/health.ts` — `/healthz` + `/readyz`
- [x] `Dockerfile` — multi-stage, non-root
- [x] `helm/Chart.yaml` + `helm/values.yaml`
- [x] `package.json`
- [x] `.env.example`
- [x] `CLAUDE.md` (in-repo TS drop-in)

### `services/_template-py/` (Python)
- [x] `src/main.py` — FastAPI + `require_auth` + OTEL + graceful shutdown
- [x] `src/config.py` — Pydantic settings
- [x] `src/health.py` — `/healthz` + `/readyz`
- [x] `Dockerfile` — multi-stage, non-root
- [x] `helm/Chart.yaml`
- [x] `helm/values.yaml` (port 8000 FastAPI default)
- [x] `pyproject.toml`
- [x] `.env.example`
- [x] `CLAUDE.md` (in-repo Python drop-in)

---

## Phase 5 — Separate Repo Templates

### `templates/new-service-repo-ts/`
- [x] `CLAUDE.md` (standalone TS drop-in — self-contained, no umbrella filesystem assumed)
- [x] `.github/workflows/ci.yml` — calls umbrella's reusable workflow
- [x] `package.json`
- [x] `.env.example`
- [x] `src/` — `main.ts`, `config.ts`, `health.ts` (published `@aeos/*` versions)
- [x] `helm/` — `Chart.yaml` + `values.yaml`
- [x] `tsconfig.json` — self-contained (no extends to umbrella)
- [x] `Dockerfile` — standalone; `GITHUB_TOKEN` build arg for GitHub Packages access

### `templates/new-service-repo-py/`
- [x] `CLAUDE.md` (standalone Python drop-in)
- [x] `.github/workflows/ci.yml`
- [x] `.env.example`
- [x] `src/` — `main.py`, `config.py`, `health.py`, `__init__.py`
- [x] `helm/` — `Chart.yaml` + `values.yaml`
- [x] `Dockerfile` — standalone; `AEOS_PYPI_URL`/`AEOS_PYPI_TOKEN` build args
- [x] `pyproject.toml` — published `aeos-*` package versions

---

## Phase 6 — Documentation Guides

### Architecture
- [x] `docs/architecture/overview.md`
- [x] `docs/architecture/service-map.md`
- [x] `docs/architecture/canonical-data-model.md`
- [x] `docs/architecture/multi-tenancy.md`
- [x] `docs/architecture/deployment-modes.md`
- [x] `docs/architecture/adr/ADR-001-polyrepo-default.md`
- [x] `docs/architecture/adr/ADR-002-clickhouse-ledger.md`
- [x] `docs/architecture/adr/ADR-003-kafka-canonical-bus.md`

### Guides
- [x] `docs/guides/new-service-in-repo.md`
- [x] `docs/guides/new-service-separate-repo.md`
- [x] `docs/guides/consuming-auth.md`
- [x] `docs/guides/consuming-event-bus.md`
- [x] `docs/guides/consuming-registries.md`
- [x] `docs/guides/ledgerrow-contract.md`

### Runbooks
- [x] `docs/runbooks/local-dev-setup.md`
- [x] `docs/runbooks/staging-deploy.md`

---

## Phase 7 — CI/CD

- [x] `.github/workflows/ci-packages.yml` — lint, test, build, publish `@aeos/*` + PyPI
- [x] `.github/workflows/ci-infra.yml` — Terraform plan on PR, apply on merge + post-apply `bootstrap-cluster.sh` job
- [x] `.github/workflows/ci-service-template.yml` — reusable workflow for separate service repos
- [x] `.github/workflows/security-scan.yml` — SAST + secret scan + dependency audit (Trivy failures pending investigation)
- [x] `.github/workflows/build-images.yml` — non-prod ECR build matrix (web + substrate + test-generator); patches ArgoCD apps + restarts deployments to pull `:latest`. Python services excluded until CodeArtifact lives.
- [x] `.github/CODEOWNERS` — patent-adjacent files gate on `@danny`
- [x] `.github/pull_request_template.md`
- [x] Changeset bot workflow (`.github/workflows/changeset-bot.yml`)

---

## Phase 8 — Infrastructure (Terraform + Helm)

### Terraform Modules
- [x] `infra/terraform/modules/eks-cluster/` — cluster + managed node group + OIDC + external-secrets IRSA + `API_AND_CONFIG_MAP` auth mode
- [x] `infra/terraform/modules/rds-postgres/`
- [x] `infra/terraform/modules/msk-kafka/`
- [x] `infra/terraform/modules/elasticache-redis/`
- [x] `infra/terraform/modules/s3-buckets/`
- [x] `infra/terraform/modules/kms-keys/`
- [x] `infra/terraform/modules/networking/` — VPC + subnets + NAT (`single_nat_gateway` flag for non-prod cost)
- [x] `infra/terraform/modules/secrets-manager/`
- [x] `infra/terraform/modules/ecr-repos/` — per-env, KMS-encrypted, scan-on-push

### Terraform Environments
- [x] `infra/terraform/environments/non-prod/` — wires up all 9 modules; **applied** (cluster `aeos-non-prod` live in us-east-1)
- [x] `infra/terraform/environments/prod/` — wired, not yet applied

### Helm Charts
- [x] `infra/helm/platform/` — ingress-nginx, cert-manager, external-secrets, external-dns, ArgoCD; CF ExternalSecret + ArgoCD ingress + ClusterIssuer + ClusterSecretStore + namespaces in `templates/`
- [x] `infra/helm/platform/argocd-apps/` — Application manifests for substrate, telemetry, recommendations, test-generator, web, observability
- [x] `infra/helm/observability/` — Grafana, Prometheus, OTel Collector, LangFuse

### Scripts
- [x] `infra/scripts/bootstrap-aws-prereqs.sh` — one-shot: GH OIDC provider + tf state bucket + lock table + IAM role
- [x] `infra/scripts/bootstrap-cluster.sh` — installs/reconciles platform Helm releases + applies argocd-apps/
- [x] `infra/scripts/build-push-images.sh` — local fallback to GH Actions image build
- [x] `infra/scripts/create-tenant.sh`

- [x] `infra/CLAUDE.md`
- [x] `docs/architecture/dns-and-tls.md`

---

## Phase 9 — Substrate Service (`services/substrate/`)

- [x] `services/substrate/CLAUDE.md`
- [x] Scaffold from `_template-ts/` (copy + rename) — full service implemented
- [x] Implement Auth + RBAC + Org Management + Agent Identity endpoints (all routes live)
- [x] OpenFGA model + seeding (`seed-openfga.ts`, ReBAC model)
- [x] Real `packages/auth-client/` implementation backed by running substrate
- [x] Helm templates (`deployment.yaml`, `service.yaml`, `serviceaccount.yaml`, `externalsecret.yaml`, `hpa.yaml`, `_helpers.tpl`) + Prisma initContainer (`npx prisma migrate deploy`)
- [x] HEALTHCHECK in Dockerfile
- [x] Deployed to non-prod (live behind `staging.aeos.fuzebox.ai/api/substrate/*`)
- [ ] Migrate substrate API ingress (`/api/substrate` rewrite-target) into the Helm chart — currently `kubectl apply` from snippet
- [ ] Graduate to separate repo (target: Day 30)

---

## Phase 10 — Agent Adapter SDK

- [x] `sdk/packages/sdk-core/` — adapter contract (`contract.ts`) + package scaffold
- [x] `sdk/adapters/anthropic/` — reference adapter stub
- [x] `sdk/adapters/openai/` — reference adapter
- [x] `sdk/adapters/bedrock/`
- [x] `sdk/adapters/vertex/`
- [x] `sdk/adapters/agentforce/`
- [x] `sdk/adapters/langgraph/`
- [x] `sdk/adapters/crewai/`
- [x] `sdk/adapters/human-workflow/`
- [x] `sdk/cli/` — `aeos-sdk generate`, `validate`, `targets` commands
- [x] `sdk/packages/sdk-core/src/generator.ts` — binding generator
- [x] `sdk/packages/sdk-core/src/emitter.ts` — OTel emitter
- [x] `sdk/CLAUDE.md`
- [ ] Open-source in own repo `github.com/fuzebox/aeos-adapter-sdk` (Day 180)

---

## Phase 11 — Package Manager & Changesets

- [x] `@changesets/cli` configured (`.changeset/config.json`)
- [x] `.npmrc` → GitHub Packages for `@aeos/*`
- [ ] Changeset bot GitHub App installed on repo
- [x] `.github/workflows/changeset-bot.yml`
- [x] PyPI publishing config (private index or GitHub Packages) wired into `ci-packages.yml`

---

## Phase 12 — Non-Prod Cutover (cluster bring-up + edge wiring)

One-shot bring-up of the non-prod EKS cluster + Cloudflare edge + GitOps reconciliation.

### AWS prereqs (one-shot per account)
- [x] `infra/scripts/bootstrap-aws-prereqs.sh` — GH OIDC provider + tf state bucket + lock table + IAM role `aeos-github-actions-terraform`
- [x] OIDC trust policy allows `repo:fuzebox-ai/aeos-platform:ref:refs/heads/main` **and** `repo:fuzebox-ai/aeos-platform:environment:*` (env-targeted jobs set sub to `environment:<name>`)

### Cluster bring-up
- [x] `terraform apply` against non-prod (cluster `aeos-non-prod`, k8s 1.30, single managed node group, single NAT)
- [x] `infra/scripts/bootstrap-cluster.sh` installs cert-manager, external-secrets, ingress-nginx, external-dns (Cloudflare provider), ArgoCD; applies `argocd-apps/`
- [x] AWS EBS CSI driver as managed EKS addon (required by Grafana + Prometheus PVCs)
- [x] EKS access entries grant operator IAM principals `AmazonEKSClusterAdminPolicy` (no aws-auth ConfigMap)
- [x] EKS auth mode `API_AND_CONFIG_MAP` so future operators can be added via `aws eks create-access-entry`

### Cloudflare edge (Full strict TLS)
- [x] CF API token (Zone:DNS:Edit + Zone:Read) stored at `aeos/non-prod/platform/cloudflare-api-token`
- [x] CF Origin CA cert (SAN `*.aeos.fuzebox.ai` + `aeos.fuzebox.ai`, 15-year) stored at `aeos/non-prod/platform/cloudflare-origin-cert`
- [x] CF SSL mode set to **Full (strict)** for the `fuzebox.ai` zone
- [x] external-dns (`provider: cloudflare`, `--cloudflare-proxied`) syncs DNS from Service/Ingress
- [x] ingress-nginx `default-ssl-certificate` mounts the Origin CA cert via ExternalSecret (`cloudflare-origin-tls`)
- [x] DNS records proxied (orange cloud) so browsers see CF-issued cert
- [x] `infra/helm/platform/templates/cloudflare-secrets.yaml` — ExternalSecret for CF token + Origin TLS
- [x] `infra/helm/platform/templates/argocd-ingress.yaml` — ArgoCD UI ingress on `staging-argocd.aeos.fuzebox.ai`

### GitOps + image build
- [x] `infra/helm/platform/argocd-apps/` — Application manifests for substrate, telemetry, recommendations, test-generator, web, observability (auto-sync, self-heal, prune)
- [x] ECR repos provisioned via `modules/ecr-repos/` (`aeos-web`, `aeos-service-substrate`, `aeos-service-telemetry`, `aeos-service-recommendations`, `aeos-service-test-generator`)
- [x] `.github/workflows/build-images.yml` builds + pushes web + substrate + test-generator on push to `main`; patches ArgoCD + rollout restart
- [x] RDS / MSK / Redis security groups allow EKS cluster SG ingress (`cluster_security_group_id` plumbed into all three modules)

### OpenFGA in-cluster
- [x] `helm upgrade --install openfga openfga/openfga -n openfga --create-namespace --set datastore.engine=memory`
- [x] Store + AEOS authorization model written via `fga store create` + `fga model write`
- [x] Substrate AWS secret populated with `OPENFGA_API_URL`, `OPENFGA_STORE_ID`, `OPENFGA_MODEL_ID`
- [x] Bootstrap admin `owner` tuple on dev tenant via `POST /v1/rbac/write`
- [ ] Switch OpenFGA to Postgres backend for prod (deferred)

### Substrate API surface
- [x] Substrate AWS secret `aeos/non-prod/substrate` populated with `{ DATABASE_URL, AUTH_JWT_SECRET, OPENFGA_API_URL, OPENFGA_STORE_ID, OPENFGA_MODEL_ID, SIGNING_PRIVATE_KEY_B64 }`
- [x] `/api/substrate/*` ingress with `nginx.ingress.kubernetes.io/rewrite-target: /$2` (currently kubectl-applied; migrating into substrate Helm chart — see Phase 9)

### Outstanding (graduate non-prod to self-service)
- [ ] AWS CodeArtifact repository for private PyPI (`aeos-*` Python packages) — long-term replacement for the interim vendored-build below
- [ ] Publish `aeos-canonical-schema`, `aeos-auth-client`, `aeos-event-bus-client`, `aeos-registry-client`, `aeos-telemetry-sdk` to CodeArtifact
- [ ] Add `AEOS_PYPI_URL` + `AEOS_PYPI_TOKEN` GH secrets (CodeArtifact-backed)
- [x] Re-enable telemetry in `build-images.yml` matrix — interim path: Dockerfile builds from repo-root context and `pip install`s the in-repo `packages/<pkg>/src/python/` directories directly. CodeArtifact will replace the COPY+install hunks but the matrix entry stays. Recommendations remains commented out, blocked on Intelligence (not on Python build).
- [ ] Deploy LangFuse helm chart in non-prod
- [ ] Centralized log shipping (CloudWatch / Loki) — today `kubectl logs` is the source of truth
- [ ] Investigate security-scan Trivy failures
- [ ] Merge PR #25 (terraform EKS auth_mode) for future cluster reboots

---

## Phase 13 — Differentiated Services (in-repo)

### `services/telemetry/` (Python FastAPI)
- [x] `services/telemetry/CLAUDE.md`
- [x] Scaffold from `_template-py/`
- [x] Span ingestion endpoint (`POST /v1/spans`), classification, OTLP/LangFuse mirror
- [x] `Dockerfile` (multi-stage; vendors `packages/*/src/python/` from repo-root build context until CodeArtifact lands)
- [x] `helm/Chart.yaml` + `helm/values.yaml`
- [x] Image built + pushed to ECR (vendored-packages path; CodeArtifact in Outstanding)
- [x] Deployed to non-prod

### `services/recommendations/` (Python FastAPI)
- [x] `services/recommendations/CLAUDE.md`
- [x] Scaffold from `_template-py/`
- [x] Pattern detection + templated recommendations endpoints
- [x] `Dockerfile` (same vendored-packages multi-stage shape as telemetry)
- [x] `helm/Chart.yaml` + `helm/values.yaml`
- [ ] Image built + pushed to ECR — Dockerfile ready, **matrix entry intentionally still commented** until Intelligence (the variance-event producer) lands; the consumer would idle indefinitely otherwise. Not blocked on Python build.
- [ ] Deployed to non-prod (blocked on image, in turn blocked on Intelligence)

### `services/test-generator/` (TypeScript Express)
- [x] `services/test-generator/CLAUDE.md`
- [x] LLM plan generator (`POST /v1/test-cases/generate` — Anthropic Messages API)
- [x] Plan CRUD (`POST/GET/DELETE /v1/test-cases[/:id]`)
- [x] Executor (`POST /v1/test-cases/:id/execute`) — synthetic + live LLM modes, auto + interactive human-handoff modes, SSE event stream
- [x] Telemetry mirror (`postSpans`) — best-effort with warn-on-error fallback
- [x] Prisma schema (`TestCase` model) + migrations
- [x] `Dockerfile` + HEALTHCHECK
- [x] `helm/` chart
- [x] Image built + pushed to ECR (`aeos-service-test-generator`)
- [x] Deployed to non-prod (live behind `staging.aeos.fuzebox.ai/api/test-generator/*`)

---

## Phase 14 — Reference Frontend (`apps/web/`)

- [x] `apps/web/CLAUDE.md`
- [x] React 18 + Vite 5 + TypeScript (strict) scaffold
- [x] TanStack Query + Zustand + Tailwind + Radix + react-hook-form/Zod + react-hot-toast + Vitest
- [x] Routes: `/login`, `/`, `/agents[/:id]`, `/uops[/:id]`, `/processes[/:id]`, `/telemetry`, `/traces/:trace_id`, `/recommendations[/:id]`, `/test-cases[/:id]`, `/settings`
- [x] AuthGuard + JWT refresh on 401 (single inflight)
- [x] Vite proxy `/api/{substrate,telemetry,recommendations,test-generator}` for local dev
- [x] `Dockerfile` (multi-stage, nginx static SPA)
- [x] `helm/` chart (deployment, service, ingress)
- [x] Image built + pushed to ECR (`aeos-web`)
- [x] Deployed to non-prod (root host `staging.aeos.fuzebox.ai`)

---

## Phase 15 — Schema-per-service rollout (deployment side)

Local-dev compose + service code now use a single shared `aeos` Postgres DB
with one schema per service (`substrate`, `telemetry`, `recommendations`,
`test_generator`, `governance`). Deployment environments still provision a
separate database per service via Helm/RDS. Land the cluster-side change so
non-prod and prod match local.

### A. RDS / Helm
- [ ] Pick the consolidation target: single `aeos` RDS instance + per-service
      schema, **or** keep per-service RDS instances and just collapse to one
      logical DB per instance with a schema. Capture the call as an ADR
      under [docs/architecture/](architecture/).
- [ ] Add `infra/terraform/modules/rds-aeos/` (or extend existing module) to
      provision the consolidated DB and a `db.tf` Postgres-provider block
      that runs `CREATE SCHEMA IF NOT EXISTS <svc>` for every service and
      grants the service role.
- [ ] Update each service Helm chart `values.yaml` to:
      - point `DATABASE_URL` at the consolidated DB (Prisma services use
        `?schema=<svc>`; Python services set `DATABASE_SCHEMA=<svc>`).
      - drop per-service DB hostname overrides (`<svc>-rds-host` ExternalSecret keys).
- [ ] Migration init container — verify it picks up schema env. Telemetry +
      recommendations use Alembic; substrate + test-generator use
      `npx prisma migrate deploy` which honors `?schema=` natively.
- [ ] One-shot data migration job per env: `pg_dump` from each per-service
      DB, restore into the new schema, verify row counts, cut over Helm,
      decommission old DB instances.

### B. Service code (already done locally — verify in cluster)
- [x] Telemetry Alembic env sets `version_table_schema` + `SET search_path`
      (`services/telemetry/alembic/env.py`).
- [x] Telemetry asyncpg pool sets `search_path` on every connection
      (`services/telemetry/src/db/connection.py`).
- [x] Recommendations Alembic + asyncpg parity.
- [x] Substrate + test-generator Prisma DSN uses `?schema=`.
- [ ] CI matrix runs `alembic upgrade head` against a consolidated DB to
      catch any unqualified DDL that landed before this cutover.

### C. Local-dev follow-ups
- [ ] Add `local-dev/scripts/fresh-start.sh` — `docker compose down -v && up -d`,
      wait for health, run all seed scripts. Documented in agent-samples
      READMEs (`./fresh-start.sh`) but the script itself is missing.
- [ ] Document the `--profile services` path in
      [docs/runbooks/local-dev-setup.md](runbooks/local-dev-setup.md): when
      to use it (full-stack containerized) vs default (infra-only +
      `pnpm dev`). Existing `postgres_data` volumes from before the schema
      change must be wiped (`docker compose down -v`) before the new
      `init-db.sql` runs.

---

## Verification Checklist

A new developer should be able to:

- [x] `pnpm install` at repo root completes without errors
- [x] `cd local-dev && docker-compose up -d` brings up all services
- [x] `pnpm seed` gives dev tenant + topics + registry data
- [x] `cp -r services/_template-ts services/my-new-service && cd services/my-new-service && pnpm dev` → `/healthz` returns 200
- [x] `cp -r services/_template-py services/my-new-service && uvicorn src.main:app` → `/healthz` returns 200
- [ ] Clone `templates/new-service-repo-ts/`, install `@aeos/*` packages, CI pipeline runs green
- [ ] PR touching `packages/canonical-schema/src/types/ledger-row.ts` is blocked without `@danny` approval

Non-prod cluster smoke:
- [x] `https://staging.aeos.fuzebox.ai/healthz` returns 200 through CF Full-strict
- [x] Login at `https://staging.aeos.fuzebox.ai/login` issues a substrate JWT
- [x] `https://staging.aeos.fuzebox.ai/api/substrate/v1/tenants/<id>/agents` returns seeded registry data
- [x] `POST /api/test-generator/v1/test-cases/generate` returns a structured plan
- [x] ArgoCD UI reachable at `https://staging-argocd.aeos.fuzebox.ai`
- [x] Grafana reachable at `https://staging-grafana.aeos.fuzebox.ai`
