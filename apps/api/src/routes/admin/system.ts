import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  PLATFORM_CAPABILITIES,
  RATE_LIMITS,
  createSuccessResponseBody,
} from "@suite/core";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { getControlSessionSecret } from "../../lib/platform-env.js";
import { getPlatformPrismaClient } from "../../lib/platform-db.js";
import {
  readPlatformHealthView,
  readPlatformQueueView,
} from "../../services/admin/system-telemetry.service.js";
import { envelope, errorResponses, platformValidationHook } from "./openapi-shared.js";
import { platformHealthSchema, queueMetricsSchema } from "./system.schema.js";
import {
  createLazyDefaultCapabilityGuard,
  readRequestId,
} from "./platform-route-shared.js";

const PLATFORM_TELEMETRY = PLATFORM_CAPABILITIES.TELEMETRY_READ.code;

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["Platform System"],
  summary: "Read aggregate platform health",
  description:
    "Probes the core datastore, cache and background processing, and reports the deployed API build. Each dependency carries its own last-checked time and an unambiguous state.",
  responses: {
    200: {
      description: "Aggregate platform health",
      content: { "application/json": { schema: envelope(platformHealthSchema) } },
    },
    ...errorResponses,
  },
});

const queuesRoute = createRoute({
  method: "get",
  path: "/queues",
  tags: ["Platform System"],
  summary: "Read queue backlog and failure counts",
  description:
    "Returns the registered queues with waiting, active, failed and delayed counts, the age of the oldest failed item, and a per-queue state.",
  responses: {
    200: {
      description: "Queue metrics",
      content: { "application/json": { schema: envelope(queueMetricsSchema) } },
    },
    ...errorResponses,
  },
});

export const platformSystemRouter = new OpenAPIHono({
  defaultHook: platformValidationHook,
});

platformSystemRouter.use(
  "*",
  rateLimitMiddleware({
    limit: RATE_LIMITS.MAX_TELEMETRY_READS_PER_MINUTE,
    windowSeconds: RATE_LIMITS.WINDOW_1_MIN_SECONDS,
    keyPrefix: "rl:admin:system",
    // Telemetry is read-only and exists to report a cache outage. A closed
    // limiter would answer 503 from the same Redis the screen probes, hiding
    // the degradation (US3 AC2, SCR-001). Authorization stays fail-closed.
    failureMode: "open",
  })
);

const systemCapabilityGuard = createLazyDefaultCapabilityGuard(() => ({
  prisma: getPlatformPrismaClient(),
  secret: getControlSessionSecret(),
  capability: PLATFORM_TELEMETRY,
}));

platformSystemRouter.use("*", systemCapabilityGuard);

platformSystemRouter.openapi(healthRoute, async (c) => {
  const data = await readPlatformHealthView();
  return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
});

platformSystemRouter.openapi(queuesRoute, async (c) => {
  const data = await readPlatformQueueView();
  return c.json(createSuccessResponseBody({ data, requestId: readRequestId(c) }), 200);
});
