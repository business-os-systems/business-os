import "dotenv/config";
import { serve } from "@hono/node-server";
import * as Sentry from "@sentry/node";
import { logger, sanitizePii } from "@suite/logger";
import { redis } from "@suite/redis";
import { createApp } from "./app.js";
import { getPlatformPrismaClient } from "./lib/platform-db.js";
import { isPlatformPlaneConfigured } from "./lib/platform-env.js";
import { createPlatformOutboxHandlers } from "./workers/platform-outbox.handlers.js";
import { startPlatformOutboxWorker } from "./workers/platform-outbox.worker.js";

const sentryDsn = process.env.SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV,
    beforeSend(event) {
      if (event.request) {
        event.request.cookies = undefined;
        event.request.headers = undefined;
      }
      return sanitizePii(event);
    },
  });
}

const rawPort = process.env.PORT;
if (!rawPort) {
  throw new Error("PORT environment variable must be pre-declared in .env");
}
const port = Number(rawPort);
const app = createApp();

// The lifecycle events commit with their state change, so a dispatcher must be
// running before the first mutation is served (T160). Without a platform
// database no lifecycle mutation can be served either, so the tenant API boots
// and says so instead of crashing (SC-011).
const platformPrisma = isPlatformPlaneConfigured()
  ? getPlatformPrismaClient()
  : null;
const outboxWorker =
  platformPrisma === null
    ? null
    : startPlatformOutboxWorker({
        prisma: platformPrisma,
        handlers: createPlatformOutboxHandlers({
          prisma: platformPrisma,
          redis,
        }),
      });

if (outboxWorker === null) {
  logger.warn(
    "PLATFORM_DATABASE_URL is not configured; the platform outbox worker is not running",
  );
}

logger.info({ port }, `Starting Platform Core API server on port ${port}...`);

const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    logger.info(
      {
        port: info.port,
        docsPath: "/doc",
        healthPath: "/health/ready",
      },
      `Platform Core API server successfully running on port ${info.port}`,
    );
  },
);

function shutdown(signal: string) {
  logger.info(
    { signal },
    "Graceful shutdown signal received. Closing HTTP server...",
  );
  outboxWorker?.stop();
  server.close(() => {
    logger.info("Platform Core API server stopped gracefully.");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
