# `@aeos/web` — Reference Frontend

Internal demo + reference implementation. Talks to substrate, telemetry, and recommendations services. Single-page React + Vite + TypeScript app.

This app is **not** customer-facing. It exists so:
- contractors can fork it when building tenant-facing surfaces
- stakeholders can see the platform without curling JSON
- end-to-end smoke testing has a hand-checkable target

---

## Stack

- React 18, Vite 5, TypeScript (strict)
- Routing: React Router 6
- Server state: TanStack Query 5
- Auth state: Zustand (persisted to localStorage)
- UI: Tailwind CSS 3 + Radix UI primitives
- Forms: react-hook-form + Zod
- Toasts: react-hot-toast
- Tests: Vitest + happy-dom + @testing-library/react

## Local development

```bash
# Backend stack first
cd local-dev && docker-compose up -d
# Then bring up substrate, telemetry, recommendations, test-generator on 3002/3003/3004/3005

cd apps/web
pnpm install
pnpm dev      # http://localhost:5173
pnpm test
pnpm build    # static SPA in dist/
```

The Vite dev server proxies `/api/{substrate,telemetry,recommendations,test-generator}` to the local backends; the FE only ever talks to `/api/...`. To point at non-local backends, set `AEOS_SUBSTRATE_URL` / `AEOS_TELEMETRY_URL` / `AEOS_RECOMMENDATIONS_URL` / `AEOS_TEST_GENERATOR_URL` env vars before `pnpm dev`. Hybrid mode (FE local + cluster substrate) is supported — see [docs/runbooks/staging-deploy.md](../../docs/runbooks/staging-deploy.md).

## Auth

`POST /api/substrate/v1/auth/token` with `{ email, password, tenant_slug }` returns `{ access_token, refresh_token, ... }`. Both tokens are persisted via Zustand → localStorage under key `aeos-auth`. `src/lib/api.ts` injects the bearer header on every request and, on a 401, runs a single inflight refresh against `/v1/auth/refresh` before retrying.

`tenant_id` always comes from the decoded JWT — never from URL params or request bodies. The substrate API enforces tenant isolation server-side; the FE just trusts what the JWT says.

## Page map

| Route | Purpose |
|---|---|
| `/login` | Sign in (email + password + tenant_slug). |
| `/` | Overview. Stat cards + recent spans + open recommendations. |
| `/agents` | Agents list. |
| `/agents/:id` | Agent detail + recent spans for that agent. |
| `/uops` | UoP list. |
| `/uops/:id` | UoP detail + linked processes. |
| `/processes` | Process list. |
| `/processes/:id` | Process detail with step list and `next_steps` chain. |
| `/telemetry` | Spans table with filters (kind, agent, UoP) + pagination. Click → drawer. |
| `/traces/:trace_id` | Trace waterfall (CSS bars) + drawer. |
| `/recommendations` | Recommendations list with filters. |
| `/recommendations/:id` | Recommendation detail + status transition buttons. |
| `/test-cases` | Test-case list — saved scenario plans for the test-generator service. |
| `/test-cases/:id` | Test-case detail + run launcher (synthetic / live; auto / interactive human-mode). Run output via SSE. |
| `/settings` | Tenant + data retention + compliance frameworks. |

## Hard rules

- `tenant_id` from JWT only. Never from URL.
- Auth-gated by `<AuthGuard>` for everything except `/login`.
- v1 is read-mostly. The only writes are `PATCH /v1/recommendations/:id`, `PATCH /v1/tenants/:id/settings`, and `POST /v1/tenants/:id/uops/import` (admin-gated bulk JSON import on `/uops` page — patent-adjacent surface, requires CTO sign-off per next bullet).
- Patent-adjacent fields (LedgerRow, Boundary, UoP, Attestation) are display-only. Do not add forms that mutate them without CTO sign-off.

## Deferred (v2)

- xyflow process graph visualization (today: linear step list)
- POST /v1/spans + creating recommendations from the UI
- Mobile responsive
- Dark mode
- i18n
- OAuth/SAML auth
