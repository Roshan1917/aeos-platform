FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

# Configure access to @aeos/* packages on GitHub Packages.
# GITHUB_TOKEN must be passed as a build arg (set in CI secrets, never baked into image).
ARG GITHUB_TOKEN
RUN echo "@aeos:registry=https://npm.pkg.github.com" > .npmrc && \
    echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" >> .npmrc

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm build

# Scrub auth credentials before runtime stage
RUN rm -f .npmrc

# --- Runtime ---
FROM node:20-alpine AS runtime
RUN addgroup -S aeos && adduser -S aeos -G aeos
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

USER aeos
EXPOSE 3000
ENTRYPOINT ["node", "dist/main.js"]
