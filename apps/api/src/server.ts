import { serve } from "@hono/node-server";
import * as Sentry from "@sentry/node";
import { logger, sanitizePii } from "@suite/logger";
import { createApp } from "./app.js";

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
  server.close(() => {
    logger.info("Platform Core API server stopped gracefully.");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
