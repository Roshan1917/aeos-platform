FROM node:20-bullseye-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/discovery/package.json ./services/discovery/package.json

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @aeos/canonical-schema build
RUN pnpm --filter @aeos/auth-client build
RUN pnpm --filter @aeos/event-bus-client build
RUN pnpm --filter @aeos/openapi-helpers build

COPY services/discovery/ ./services/discovery/

RUN cd services/discovery && npx prisma generate
RUN pnpm --filter @aeos/discovery build

# --- Runtime ---
FROM node:20-bullseye-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN groupadd -r aeos && useradd -r -g aeos aeos
WORKDIR /app

COPY --from=builder --chown=aeos:aeos /app/services/discovery ./services/discovery
COPY --from=builder --chown=aeos:aeos /app/node_modules ./node_modules
COPY --from=builder --chown=aeos:aeos /app/packages ./packages

# Document storage volume — owned by aeos user.
RUN mkdir -p /app/services/discovery/uploads/documents && chown -R aeos:aeos /app/services/discovery/uploads

WORKDIR /app/services/discovery
USER aeos
EXPOSE 3006

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3006)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Run migrations on container start, then launch the server.
CMD ["sh", "-c", "../../node_modules/.pnpm/node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma && node dist/main.js"]
