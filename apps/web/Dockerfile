FROM node:20-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy workspace manifests for cache-friendly install
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm install --frozen-lockfile

# Bigger Node heap so esbuild/vite don't OOM during the web bundle build.
ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN pnpm --filter @aeos/canonical-schema build && \
    pnpm --filter @aeos/web build

# --- Runtime ---
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://localhost/healthz || exit 1
