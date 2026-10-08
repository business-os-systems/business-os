import { serve } from "@hono/node-server";
import { logger } from "@suite/logger";
import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 3000;
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
        docsUrl: `http://localhost:${info.port}/doc`,
        healthUrl: `http://localhost:${info.port}/health/ready`,
      },
      `Platform Core API server successfully running at http://localhost:${info.port}`
    );
  }
);

function shutdown(signal: string) {
  logger.info({ signal }, "Graceful shutdown signal received. Closing HTTP server...");
  server.close(() => {
    logger.info("Platform Core API server stopped gracefully.");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
