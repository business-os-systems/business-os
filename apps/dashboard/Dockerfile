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
RUN turbo prune @suite/dashboard --docker

# 3. Build & compile standalone Next.js bundle
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

# Build dependencies and Next.js in standalone mode
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm turbo run build --filter=@suite/dashboard...

# Extract Prisma native query engines for standalone runner
RUN mkdir -p /app/prisma-engines && \
    find /app/node_modules -name "libquery_engine*.so.node" -exec cp {} /app/prisma-engines/ \;

# 4. Minimal Production Runner
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends openssl libc6 ca-certificates && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 nextjs

# Copy standalone build artifacts
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/public ./apps/dashboard/public

# Copy Prisma engines to Next.js server directory and /tmp/prisma-engines
RUN mkdir -p /tmp/prisma-engines && chmod 777 /tmp/prisma-engines
COPY --from=builder --chown=nextjs:nodejs /app/prisma-engines/ ./apps/dashboard/.next/server/
COPY --from=builder /app/prisma-engines/ /tmp/prisma-engines/

USER nextjs

EXPOSE 3001

CMD ["node", "apps/dashboard/server.js"]
