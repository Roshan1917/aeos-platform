# Local Development Setup

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node | 20.x | `nvm install 20 && nvm use 20` (Node 22+ has known Prisma 5 incompatibilities) |
| pnpm | 9+ | `npm install -g pnpm@9` |
| Docker | 24+ | Docker Desktop |
| Python | 3.11+ | `pyenv install 3.11` |

## 1. Clone + install

```bash
git clone git@github.com:fuzebox-ai/aeos-platform.git
cd aeos-platform
nvm use 20
pnpm install
```

## 2. Bring up backing services

```bash
cd local-dev
cp .env.example .env
docker compose up -d
```

Wait ~30s for Kafka to be healthy:

| Service | Port | Purpose |
|---|---|---|
| Kafka | 9092 | Event bus |
| Postgres | 5432 | Transactional DB (one DB per service: `aeos_substrate`, `aeos_telemetry`, `aeos_test_generator`, etc.) |
| Redis | 6379 | Cache, locks, sessions |
| OpenFGA | 8080 | RBAC backend (Postgres-backed locally) |
| LangFuse | 3001 | LLM span observability UI |
| LocalStack | 4566 | AWS S3, KMS, Secrets Manager (local) |
| OTel Collector | 4317 / 4318 | Receives service spans, forwards to LangFuse |

`local-dev/init-db.sql` provisions all per-service Postgres databases on first start.

## 3. Seed OpenFGA (one-time, before substrate runs)

OpenFGA stores authorization tuples for the substrate. The store + model are created out-of-band; substrate's `.env` references them by ID.

```bash
# from repo root
pnpm tsx local-dev/seed/seed-openfga.ts
```

The script prints the generated IDs:

```
OPENFGA_STORE_ID=01KQQKV2RHF7BKQHRRE7M931Z8
OPENFGA_MODEL_ID=01KQQKV2RSRGWVW9YYYCWQA8MM
OPENFGA_API_URL=http://localhost:8080
```

Copy them into `services/substrate/.env` (the `.env.example` ships with empty values for these — fill them in after this step).

If you re-run `seed-openfga.ts` later, the IDs change; update `.env` again and restart substrate.

## 4. Bring up substrate

```bash
cd services/substrate
cp .env.example .env
# Paste the OpenFGA IDs from step 3 into .env
pnpm prisma migrate deploy   # apply schema
pnpm prisma generate         # generate per-service client (writes to ./prisma/generated/)
pnpm dev                     # listens on :3002
```

Substrate's `dev` script wraps `tsx watch` with `dotenv -e .env` so the env file is picked up automatically.

Verify: `curl http://localhost:3002/healthz` → `200`.

## 5. Seed the dev tenant + registries

In another terminal, from repo root:

```bash
pnpm tsx local-dev/seed/seed-tenant.ts
pnpm tsx local-dev/seed/seed-registries.ts
```

This creates a tenant `dev-corp` with three users (admin / analyst / viewer at `dev-corp.local`, password `DevPassword1234!`), three Agents, three UoPs, and two Processes.

## 6. Bring up the other in-repo services

Each service has its own `.env.example`. **All `AUTH_JWT_SECRET` values must match** — substrate signs JWTs that other services verify, and any mismatch yields 401 on every authenticated route. The `.env.example` files all ship with the same dev default; don't change one without changing all.

### test-generator (Node, port 3005)

```bash
cd services/test-generator
cp .env.example .env
# .env requires ANTHROPIC_API_KEY for /v1/test-cases/generate
pnpm prisma migrate deploy
pnpm prisma generate
pnpm dev
```

### telemetry (Python, port 3003)

```bash
cd services/telemetry
python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head
uvicorn src.main:app --reload --port 3003
```

`src/main.py` calls `load_dotenv()` at import time so `.env` is picked up by both pydantic-settings *and* the auth-client middleware (which reads `os.environ` directly).

### recommendations (Python, port 3004)

```bash
cd services/recommendations
python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head
# Set SUBSCRIBE_TENANT_IDS in .env to your dev tenant id (from seed-tenant.ts output) before running.
uvicorn src.main:app --reload --port 3004
```

### web (Vite SPA, port 5173)

```bash
cd apps/web
pnpm dev
```

Login at http://localhost:5173/login: `admin@dev-corp.local` / `DevPassword1234!` / tenant_slug `dev-corp`.

## Useful URLs (local)

| URL | What |
|---|---|
| http://localhost:5173 | Web UI |
| http://localhost:3001 | LangFuse |
| http://localhost:8080 | OpenFGA |
| http://localhost:4566 | LocalStack |

## Troubleshooting

**`Cannot read properties of undefined (reading 'findUnique')`** — Prisma client was generated for a different service. Each service writes its client to `./prisma/generated/` via the `output` directive in `schema.prisma`, so this should not happen on a fresh checkout. If it does, run `pnpm prisma generate` in the affected service's directory.

**`RuntimeError: Auth not configured: set AUTH_JWKS_URI ... or AUTH_JWT_SECRET`** — telemetry / recommendations couldn't read `.env` into `os.environ`. Make sure you started uvicorn from the service directory (so `.env` is in cwd) and that the service's `src/main.py` calls `load_dotenv()` at the top.

**401 Unauthorized on every API call after login** — the `AUTH_JWT_SECRET` in one service's `.env` doesn't match substrate's. Diff the values across `services/*/.env`.

**Kafka not starting:** `docker compose logs kafka`. If CLUSTER_ID error: `docker compose down -v && docker compose up -d`.

**Postgres connection refused:** `docker compose logs postgres` — may take 10s to be ready.

**Port conflicts:** override in `local-dev/docker-compose.override.yml`.

**`pnpm install` fails — missing @aeos/* packages:** Run `pnpm install` at the repo root, not inside a service directory.
