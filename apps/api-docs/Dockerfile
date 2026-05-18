FROM node:20-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY apps/api-docs ./apps/api-docs

RUN pnpm install --frozen-lockfile --filter @aeos/api-docs...

ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN pnpm --filter @aeos/api-docs build

# --- Runtime ---
FROM nginx:1.27-alpine AS runtime
COPY apps/api-docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/api-docs/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://localhost/healthz || exit 1
