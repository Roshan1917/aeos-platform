FROM node:20-bullseye-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/substrate/package.json ./services/substrate/package.json

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @aeos/canonical-schema build
RUN pnpm --filter @aeos/event-bus-client build
RUN pnpm --filter @aeos/telemetry-sdk build
RUN pnpm --filter @aeos/openapi-helpers build

COPY services/substrate/ ./services/substrate/

# Generate Prisma client
RUN cd services/substrate && npx prisma generate

RUN pnpm --filter @aeos/substrate build

# --- Runtime ---
FROM node:20-bullseye-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN groupadd -r aeos && useradd -r -g aeos aeos
WORKDIR /app

COPY --from=builder --chown=aeos:aeos /app/services/substrate ./services/substrate
COPY --from=builder --chown=aeos:aeos /app/node_modules ./node_modules
COPY --from=builder --chown=aeos:aeos /app/packages ./packages

WORKDIR /app/services/substrate
USER aeos
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3002)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "dist/main.js"]
