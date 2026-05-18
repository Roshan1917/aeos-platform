FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY services/REPLACE_ME/package.json ./services/REPLACE_ME/package.json

# Install deps
RUN pnpm install --frozen-lockfile

# Build shared packages
RUN pnpm --filter @aeos/canonical-schema build
RUN pnpm --filter @aeos/auth-client build
RUN pnpm --filter @aeos/event-bus-client build
RUN pnpm --filter @aeos/registry-client build
RUN pnpm --filter @aeos/telemetry-sdk build

# Copy and build service
COPY services/REPLACE_ME/ ./services/REPLACE_ME/
RUN pnpm --filter @aeos/service-REPLACE_ME build

# --- Runtime ---
FROM node:20-alpine AS runtime
RUN addgroup -S aeos && adduser -S aeos -G aeos
WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/services/REPLACE_ME/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

USER aeos
EXPOSE 3000
ENTRYPOINT ["node", "dist/main.js"]
