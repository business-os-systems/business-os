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
import { createWebsiteBuilderRoutes } from "@suite/website-builder/routes";
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

  // 4. Mount Core & Module Sub-Routers
  app.route("/api/v1/auth", authRouter);
  app.route("/api/v1/organizations", organizationsRouter);
  app.route("/api/v1/branches", branchesRouter);
  app.route("/api/v1/audit-logs", auditLogsRouter);
  app.route("/api/v1/cms", createWebsiteBuilderRoutes());

  // 5. Environment Guarded OpenAPI 3.1 Documentation & Interactive Scalar UI
  // In production, internal documentation is locked or restricted to authorized internal access.
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && !process.env.ENABLE_INTERNAL_DOCS) {
    app.get("/doc", (c) => {
      return c.text("Forbidden: API documentation is disabled in production.", 403);
    });
    app.get("/openapi.json", (c) => {
      return c.text("Forbidden: API specification is disabled in production.", 403);
    });
  } else {
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
          url: process.env.API_URL ?? "/",
          description: "API Gateway Server",
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
  }

  return app;
}

export type AppType = ReturnType<typeof createApp>;
