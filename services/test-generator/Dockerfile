FROM node:20-bullseye-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/test-generator/package.json ./services/test-generator/package.json

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @aeos/canonical-schema build
RUN pnpm --filter @aeos/auth-client build
RUN pnpm --filter @aeos/telemetry-sdk build
RUN pnpm --filter @aeos/openapi-helpers build

COPY services/test-generator/ ./services/test-generator/

RUN cd services/test-generator && npx prisma generate
RUN pnpm --filter @aeos/test-generator build

# --- Runtime ---
FROM node:20-bullseye-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN groupadd -r aeos && useradd -r -g aeos aeos
WORKDIR /app

COPY --from=builder --chown=aeos:aeos /app/services/test-generator ./services/test-generator
COPY --from=builder --chown=aeos:aeos /app/node_modules ./node_modules
COPY --from=builder --chown=aeos:aeos /app/packages ./packages

WORKDIR /app/services/test-generator
USER aeos
EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3005)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "dist/main.js"]
