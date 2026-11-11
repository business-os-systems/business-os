# syntax=docker/dockerfile:1.7
# Build context: repository root.
#   docker build -f deploy/platform/Dockerfile --target platform .
#
# The API and the tenant applications have their own Dockerfiles
# (apps/api, apps/dashboard, apps/web); this file builds only the operator
# console, which needs the full workspace build ahead of `pnpm deploy`.
FROM node:22-alpine AS build
ENV CI=true
ENV HUSKY=0
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@suite/platform...

FROM build AS platform-deploy
RUN pnpm --filter @suite/platform deploy --prod --legacy /out/platform

FROM node:22-alpine AS platform
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
ENV HOSTNAME="0.0.0.0"
WORKDIR /app
COPY --from=platform-deploy /out/platform /app
COPY --from=build /repo/apps/platform/.next /app/.next
EXPOSE 3002
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3002"]
