import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  measureEventLoopLag,
  probeDatabase,
  probeRedis,
} from "../services/admin/health.service.js";

export const healthRouter = new OpenAPIHono();

const livenessResponseSchema = z.object({
  status: z.string().openapi({ example: "ok" }),
  uptime: z.number().openapi({ description: "Process uptime in seconds", example: 42.5 }),
  eventLoopLagMs: z
    .number()
    .openapi({ description: "Event loop delay in milliseconds", example: 0.8 }),
  timestamp: z.string().datetime().openapi({ example: "2026-10-08T12:00:00.000Z" }),
});

const dependencyProbeSchema = z.object({
  status: z.enum(["connected", "disconnected"]),
  latencyMs: z.number().openapi({ description: "Probe latency in milliseconds", example: 1.2 }),
});

const readinessSuccessResponseSchema = z.object({
  status: z.string().openapi({ example: "ready" }),
  database: z.enum(["connected", "disconnected"]).openapi({ example: "connected" }),
  redis: z.enum(["connected", "disconnected"]).openapi({ example: "connected" }),
  dependencies: z.object({
    database: dependencyProbeSchema,
    redis: dependencyProbeSchema,
  }),
  timestamp: z.string().datetime().openapi({ example: "2026-10-08T12:00:00.000Z" }),
});

const readinessFailureResponseSchema = z.object({
  type: z.string().openapi({ example: "/errors/service-unavailable" }),
  title: z.string().openapi({ example: "Service Unavailable" }),
  status: z.number().openapi({ example: 503 }),
  detail: z.string().openapi({
    example: "One or more critical infrastructure dependencies are unreachable.",
  }),
  code: z.string().openapi({ example: "SERVICE_UNAVAILABLE" }),
  instance: z.string().openapi({ example: "/health/ready" }),
  database: z.enum(["connected", "disconnected"]).openapi({ example: "disconnected" }),
  redis: z.enum(["connected", "disconnected"]).openapi({ example: "connected" }),
  dependencies: z.object({
    database: dependencyProbeSchema,
    redis: dependencyProbeSchema,
  }),
  timestamp: z.string().datetime().openapi({ example: "2026-10-08T12:00:00.000Z" }),
});

export const getLivenessRoute = createRoute({
  method: "get",
  path: "/live",
  tags: ["Health & System Telemetry"],
  summary: "Shallow liveness probe",
  description: "Confirms HTTP process is running, responding, and event loop lag is healthy.",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: livenessResponseSchema,
        },
      },
      description: "Service is live and accepting traffic.",
    },
  },
});

export const getReadinessRoute = createRoute({
  method: "get",
  path: "/ready",
  tags: ["Health & System Telemetry"],
  summary: "Deep readiness probe",
  description:
    "Verifies live connectivity to PostgreSQL database (SELECT 1) and Redis cluster ping with bounded timeouts (<150ms). Returns 503 RFC 7807 problem details if any critical dependency is unreachable.",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: readinessSuccessResponseSchema,
        },
      },
      description:
        "All core platform dependencies (PostgreSQL & Redis) are fully reachable and healthy.",
    },
    503: {
      content: {
        "application/problem+json": {
          schema: readinessFailureResponseSchema,
        },
      },
      description: "One or more core platform dependencies are unreachable.",
    },
  },
});

healthRouter.openapi(getLivenessRoute, async (c) => {
  const eventLoopLagMs = await measureEventLoopLag();
  return c.json(
    {
      status: "ok",
      uptime: process.uptime(),
      eventLoopLagMs,
      timestamp: new Date().toISOString(),
    },
    200
  );
});

healthRouter.openapi(getReadinessRoute, async (c) => {
  const [dbResult, redisResult] = await Promise.all([probeDatabase(), probeRedis()]);

  const isReady = dbResult.status === "connected" && redisResult.status === "connected";
  const timestamp = new Date().toISOString();

  if (!isReady) {
    return c.json(
      {
        type: "/errors/service-unavailable",
        title: "Service Unavailable",
        status: 503,
        detail: "One or more critical infrastructure dependencies are unreachable.",
        code: "SERVICE_UNAVAILABLE",
        instance: "/health/ready",
        database: dbResult.status,
        redis: redisResult.status,
        dependencies: {
          database: {
            status: dbResult.status,
            latencyMs: dbResult.latencyMs,
          },
          redis: {
            status: redisResult.status,
            latencyMs: redisResult.latencyMs,
          },
        },
        timestamp,
      },
      503,
      {
        "Content-Type": "application/problem+json; charset=utf-8",
      }
    );
  }

  return c.json(
    {
      status: "ready",
      database: dbResult.status,
      redis: redisResult.status,
      dependencies: {
        database: {
          status: dbResult.status,
          latencyMs: dbResult.latencyMs,
        },
        redis: {
          status: redisResult.status,
          latencyMs: redisResult.latencyMs,
        },
      },
      timestamp,
    },
    200
  );
});
