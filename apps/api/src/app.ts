import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import {
  requestIdMiddleware,
  accessLoggerMiddleware,
  securityHeadersMiddleware,
  corsMiddleware,
  rateLimitMiddleware,
  globalErrorHandler,
} from "./middleware/index.js";
import {
  healthRouter,
  authRouter,
  organizationsRouter,
  branchesRouter,
  auditLogsRouter,
} from "./routes/index.js";
import { metricsRegistry } from "./telemetry.js";

export interface AppOptions {
  enableRateLimiting?: boolean;
  corsOrigins?: string[];
}

/**
 * Creates and configures the production Platform Core Hono v4 Application.
 */
export function createApp(options: AppOptions = {}) {
  const app = new OpenAPIHono();

  // 1. Core Production Middleware Pipeline
  app.use("*", requestIdMiddleware());
  app.use("*", accessLoggerMiddleware());
  app.use("*", securityHeadersMiddleware());
  app.use("*", corsMiddleware({ allowedOrigins: options.corsOrigins }));

  if (options.enableRateLimiting !== false) {
    app.use("*", rateLimitMiddleware());
  }

  // 2. Global RFC 7807 Error Handler
  app.onError(globalErrorHandler);

  // 3. Health & Telemetry Routes
  app.route("/health", healthRouter);
  app.get("/metrics", async (c) => {
    const metrics = await metricsRegistry.metrics();
    c.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return c.text(metrics);
  });

  // 4. OpenAPI 3.1 Documentation Spec & Interactive Scalar UI
  app.doc("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Universal Business OS Platform API",
      version: "1.0.0",
      description:
        "High-throughput enterprise modular business operating system. Supports multi-tenancy, dynamic RBAC, shift terminal switching, and anti-theft override mechanics.",
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Local Development Server",
      },
    ],
  });

  app.get(
    "/doc",
    apiReference({
      spec: {
        url: "/openapi.json",
      },
      theme: "saturn",
      layout: "modern",
    })
  );

  // 5. Mount Core Sub-Routers
  app.route("/api/v1/auth", authRouter);
  app.route("/api/v1/organizations", organizationsRouter);
  app.route("/api/v1/branches", branchesRouter);
  app.route("/api/v1/audit-logs", auditLogsRouter);

  return app;
}

export type AppType = ReturnType<typeof createApp>;
