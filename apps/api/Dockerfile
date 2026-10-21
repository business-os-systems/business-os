# syntax=docker/dockerfile:1

# 1. Base Node environment with pnpm
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate
RUN apt-get update && apt-get install -y --no-install-recommends openssl libc6 ca-certificates && rm -rf /var/lib/apt/lists/*

# 2. Prune monorepo dependencies with Turbo
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@^2.4.2
COPY . .
RUN turbo prune @suite/api --docker

# 3. Build & compile TypeScript bundle
FROM base AS builder
WORKDIR /app

# Copy package manifests and lockfile from pruner
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

# Install dependencies with pnpm
RUN pnpm install --frozen-lockfile

# Copy pruned source files
COPY --from=pruner /app/out/full/ .

# Generate Prisma Client with container binary targets
RUN pnpm --filter @suite/db prisma:generate

# Build dependencies and Core API
RUN pnpm turbo run build --filter=@suite/api...

# 4. Minimal Production Runner
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN apt-get update && apt-get install -y --no-install-recommends openssl libc6 ca-certificates && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 apisvc

# Copy monorepo with production dependencies and compiled artifacts
COPY --from=builder --chown=apisvc:nodejs /app ./

USER apisvc

EXPOSE 3000

CMD ["/app/apps/api/node_modules/.bin/tsx", "apps/api/src/server.ts"]
