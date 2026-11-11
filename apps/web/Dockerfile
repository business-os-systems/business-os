# syntax=docker/dockerfile:1
# Production image for the public storefront (@suite/web). Build context: repository root.

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@^2.4.2
COPY . .
RUN turbo prune @suite/web --docker

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm turbo run build --filter=@suite/web...

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3003
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app ./
RUN mkdir -p /app/apps/web/.next/cache \
    && chown -R nextjs:nodejs /app/apps/web/.next/cache \
    && chmod 775 /app/apps/web/.next/cache
USER nextjs
EXPOSE 3003
CMD ["node", "apps/web/node_modules/next/dist/bin/next", "start", "apps/web", "-p", "3003"]
