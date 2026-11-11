import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import {
  requestIdMiddleware,
  accessLoggerMiddleware,
  securityHeadersMiddleware,
  corsMiddleware,
  resolvePlatformCorsOrigins,
  rateLimitMiddleware,
  requireAuth,
  requireMetricsAuth,
  createTenantAccessGuard,
  createImpersonationReadonlyGuard,
  SUPPORT_SESSION_HEADER,
  globalErrorHandler,
} from "./middleware/index.js";
import { prisma } from "@suite/db";
import { redis } from "@suite/redis";
import {
  healthRouter,
  systemRouter,
  authRouter,
  organizationsRouter,
  branchesRouter,
  auditLogsRouter,
  adminRouter,
  platformAuthRouter,
  referenceRouter,
  supportSessionsRouter,
  createCmsRouter,
  createMediaRouter,
  createPublicInquiryRouter,
  createStorefrontRouter,
  abuseRouter,
} from "./routes/index.js";
import {
  assertProductionConfiguration,
  getPublicApiUrl,
  isEdgeAdmissionEnforced,
  isInternalDocsEnabled,
  isProduction,
} from "./lib/env.js";
import {
  createEdgeAdmissionMiddleware,
} from "./middleware/edge-admission.js";
import { getEdgeAudience, getEdgeTeamDomain } from "./lib/platform-env.js";
import { assertMediaConfiguration } from "@suite/media";
import { metricsRegistry } from "./telemetry.js";
import { abuseContactLinkMiddleware } from "./middleware/abuse-contact-link.js";

/** Tenant-plane prefixes that require a session and a non-blocked workspace. */
const TENANT_DATA_PREFIXES = [
  "/api/v1/organizations",
  "/api/v1/branches",
  "/api/v1/audit-logs",
  "/api/v1/support-sessions",
  "/api/v1/cms",
  "/api/v1/media",
] as const;

export interface AppOptions {
  enableRateLimiting?: boolean;
  corsOrigins?: string[];
}

/**
 * Creates and configures the production Platform Core Hono v4 Application.
 */
export function createApp(options: AppOptions = {}) {
  // Every HTTP entrypoint constructs the app, so the production guard lives here.
  assertProductionConfiguration();
  if (isProduction) {
    // A production boot must not come up able to issue placeholder signatures.
    assertMediaConfiguration();
  }

  const app = new OpenAPIHono();

  // 1. Core Production Middleware Pipeline
  app.use("*", requestIdMiddleware());
  app.use("*", accessLoggerMiddleware());
  app.use("*", securityHeadersMiddleware());
  const corsOrigins =
    options.corsOrigins ?? resolvePlatformCorsOrigins();
  app.use("*", corsMiddleware({ allowedOrigins: corsOrigins }));

  if (options.enableRateLimiting !== false) {
    app.use("*", rateLimitMiddleware());
  }

  // A signed support-session ticket makes every tenant write read-only. It is
  // registered before the routers so no tenant mutation can bypass it (SC-017).
  app.use(
    "/api/v1/*",
    createImpersonationReadonlyGuard({ headerName: SUPPORT_SESSION_HEADER })
  );

  // 2. Global RFC 7807 Error Handler
  app.onError(globalErrorHandler);

  // 3. Health & Telemetry Routes
  app.route("/health", healthRouter);
  app.get("/metrics", requireMetricsAuth(), async (c) => {
    const metrics = await metricsRegistry.metrics();
    c.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return c.text(metrics);
  });

  // 4. Mount Core & Module Sub-Routers

  // Public storefront responses carry the published abuse contact, including
  // holding and GONE responses. Registered before the storefront routes so the
  // middleware runs for every request in that prefix.
  app.use("/api/v1/storefront/*", abuseContactLinkMiddleware());

  // Public storefront intake. It sits before every tenant guard because a
  // visitor has no session; the published site id is the only input and the
  // service resolves its workspace through a security-definer helper.
  app.route("/api/v1/storefront/forms", createPublicInquiryRouter());
  app.route("/api/v1/storefront", createStorefrontRouter());
  app.route("/api/v1/abuse", abuseRouter);

  app.route("/api/v1/system", systemRouter);
  app.route("/api/v1/auth", authRouter);

  // Tenant operational routes: requireAuth, then the suspension gate. One list
  // so a new tenant router cannot be added to one pass and forgotten in the
  // other. /api/v1/cms sits inside this pipeline; its routes additionally
  // enforce cms:sites:* and cms:pages:* (contract cms-admin, SCR-002).
  const tenantAccessGuard = createTenantAccessGuard({ prisma, redis });
  for (const prefix of TENANT_DATA_PREFIXES) {
    app.use(`${prefix}/*`, requireAuth());
    app.use(prefix, requireAuth());
  }
  for (const prefix of TENANT_DATA_PREFIXES) {
    app.use(`${prefix}/*`, tenantAccessGuard);
    app.use(prefix, tenantAccessGuard);
  }

  app.route("/api/v1/organizations", organizationsRouter);
  app.route("/api/v1/branches", branchesRouter);
  app.route("/api/v1/audit-logs", auditLogsRouter);
  app.route("/api/v1/support-sessions", supportSessionsRouter);
  app.route("/api/v1/cms", createCmsRouter());
  app.route("/api/v1/media", createMediaRouter());

  // FR-069: when enforced, the origin verifies the Cloudflare Access
  // assertion itself; the /auth mount is covered before the admin router.
  if (isEdgeAdmissionEnforced()) {
    const edgeAdmission = createEdgeAdmissionMiddleware({
      teamDomain: getEdgeTeamDomain(),
      audience: getEdgeAudience(),
    });
    app.use("/api/v1/admin", edgeAdmission);
    app.use("/api/v1/admin/*", edgeAdmission);
  }

  // Platform operator auth is public/session-based, not tenant-auth.
  app.route("/api/v1/admin/auth", platformAuthRouter);

  // Admin API — auth and rate limiting are applied inside the router.
  app.route("/api/v1/admin", adminRouter);

  // Shared reference vocabularies. Every application reads these; the path is
  // read-only and sits outside /admin by contract (FR-105, FR-112).
  app.route("/api/v1/reference", referenceRouter);

  // 5. Environment Guarded OpenAPI 3.1 Documentation & Interactive Scalar UI
  // In production, internal documentation is locked or restricted to authorized internal access.
  if (isProduction && !isInternalDocsEnabled()) {
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
          url: getPublicApiUrl(),
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
