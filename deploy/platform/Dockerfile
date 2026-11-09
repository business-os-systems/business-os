# syntax=docker/dockerfile:1.7
# Build context: repository root.
#   docker build -f deploy/platform/Dockerfile --target api .
#   docker build -f deploy/platform/Dockerfile --target platform .
FROM node:22-alpine AS build
ENV CI=true
ENV HUSKY=0
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build

FROM build AS api-deploy
RUN pnpm --filter @suite/api deploy --prod --legacy /out/api

FROM node:22-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-deploy /out/api /app
COPY --from=build /repo/apps/api/dist /app/dist
EXPOSE 4000
CMD ["node", "dist/src/server.js"]

FROM build AS platform-deploy
RUN pnpm --filter @suite/platform deploy --prod --legacy /out/platform

FROM node:22-alpine AS platform
ENV NODE_ENV=production
WORKDIR /app
COPY --from=platform-deploy /out/platform /app
COPY --from=build /repo/apps/platform/.next /app/.next
EXPOSE 3002
CMD ["pnpm", "start"]
