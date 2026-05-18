# Operating the AEOS Reference Web App

Audience: anyone who needs to run the reference frontend locally for a demo, debug a UI bug, or stand up a temporary instance pointed at non-local backends.

Service location: `apps/web/` (React + Vite + TypeScript). Source of truth: [`apps/web/CLAUDE.md`](../../apps/web/CLAUDE.md).

---

## What it is

A read-mostly SPA that signs in via substrate, then exercises every endpoint we ship today:

- substrate `/v1/auth/token`, `/v1/auth/refresh`, `/v1/users`, `/v1/agents`, `/v1/agent-contracts`, `/v1/tenants/:tid/{uops,processes,agents}`, `/v1/tenants/:id/settings`
- telemetry `/v1/spans`, `/v1/spans/:id`, `/v1/traces/:trace_id`
- recommendations `/v1/recommendations`, `/v1/recommendations/:id` (GET + PATCH)

It is not customer-facing — it's a reference + demo + smoke-test target.

---

## Local dev

```bash
# 1. Backend stack
cd local-dev && docker-compose up -d

# 2. Backend services (in three separate shells, with each .env loaded)
cd services/substrate     && pnpm dev          # :3002
cd services/telemetry     && uvicorn src.main:app --port 3003   # ensure env exported, see runbook
cd services/recommendations && uvicorn src.main:app --port 3004 # SUBSCRIBE_TENANT_IDS=<tid>

# 3. Web app
cd apps/web
pnpm install
pnpm dev               # http://localhost:5173
```

Sign in: `admin@dev-corp.local` / `DevPassword1234!` / tenant slug `dev-corp`.

---

## Pointing at non-local backends

The Vite dev server reads three env vars at startup:

```bash
AEOS_SUBSTRATE_URL=https://substrate.staging.fuzebox.local \
AEOS_TELEMETRY_URL=https://telemetry.staging.fuzebox.local \
AEOS_RECOMMENDATIONS_URL=https://recs.staging.fuzebox.local \
pnpm dev
```

Browser still hits `/api/{substrate,telemetry,recommendations}` — Vite forwards to whatever you pass in.

---

## Healthcheck

When run via Docker / Helm: `GET /healthz` returns `200 ok`. The k8s ingress is responsible for routing `/api/*` paths to the corresponding service ClusterIPs and everything else to this nginx.

---

## Tests

```bash
cd apps/web
pnpm test              # vitest run
pnpm typecheck
pnpm build             # also catches typecheck regressions
```

Critical tests:
- `tests/lib/api.test.ts` — refresh-on-401 inflight de-dup.
- `tests/components/StatCard.test.tsx`, `tests/components/TraceWaterfall.test.tsx` — basic UI smoke.

---

## Failure modes & triage

| Symptom | Likely cause | First move |
|---|---|---|
| Login shows "401 invalid_credentials" | Tenant slug or email/password wrong, or substrate down | Check `seed-tenant.ts` ran; curl `POST /v1/auth/token` directly |
| Dashboard shows 0 everywhere | Substrate up, but JWT tenant_id doesn't match a seeded tenant | Decode JWT, confirm `tenant_id` matches DB |
| `/telemetry` says "no spans" | Telemetry service hasn't received any spans yet | Run `local-dev/seed/seed-spans.ts`, then refetch |
| `PATCH` on recommendation fails 401 | Bearer token expired and refresh also expired | Sign out and sign back in |
| Browser network tab shows CORS error | Vite dev server not running, or `AEOS_*_URL` env points to a backend that's not reachable | Restart `pnpm dev`; verify backend is reachable from the host |
| Recent spans dashboard widget never updates | TanStack Query default `staleTime` is 30s | Hard refresh (`refetchOnWindowFocus` is off by design) |

---

## Production deploy notes (sketch)

- Build static SPA with `pnpm build`. Output in `apps/web/dist/`.
- Docker image (`apps/web/Dockerfile`) serves the built SPA from nginx on port 80 with a `/healthz` endpoint for k8s probes.
- The k8s ingress is responsible for path-based routing: `/api/substrate/*` → substrate Service, `/api/telemetry/*` → telemetry Service, `/api/recommendations/*` → recommendations Service, everything else → this nginx pod.
- TLS, SSO, CDN cache headers — defer to ingress / CloudFront layer; not this image's concern.

---

## When to bypass this UI

- Bulk data work: use `psql` and the canonical event bus.
- Patent-adjacent type changes (LedgerRow, Boundary, UoP, Attestation): forms here are read-only by design. Mutate via migrations + CTO sign-off.
- Production tenant management: substrate API + admin tooling, not this SPA.
