# @aeos/web

AEOS reference frontend. React + Vite + TypeScript SPA that signs into the substrate service and exercises the full surface of the platform: agents, UoPs, processes, telemetry spans, and recommendations.

See [`CLAUDE.md`](./CLAUDE.md) for the page map, auth flow, and stack rationale. See [`docs/guides/operating-web.md`](../../docs/guides/operating-web.md) for the runbook.

## Quickstart

```bash
# Bring up backend stack
cd ../../local-dev && docker-compose up -d
# Run substrate/telemetry/recommendations on 3002/3003/3004

cd apps/web
pnpm install
pnpm dev          # http://localhost:5173
```

Sign in with `admin@dev-corp.local` / `DevPassword1234!` / tenant slug `dev-corp` (seeded by `local-dev/seed/seed-tenant.ts`).

## Scripts

```
pnpm dev         # vite dev server
pnpm build       # tsc -b && vite build → dist/
pnpm preview     # serve dist/
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
pnpm lint        # eslint
```
