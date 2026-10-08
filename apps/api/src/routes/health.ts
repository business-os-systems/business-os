import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "@suite/db";
import { redisHealthCheck } from "@suite/redis";

export const healthRouter = new OpenAPIHono();

const livenessResponseSchema = z.object({
  status: z.string().openapi({ example: "ok" }),
  uptime: z.number().openapi({ description: "Process uptime in seconds", example: 42.5 }),
  timestamp: z.string().datetime().openapi({ example: "2026-10-08T12:00:00.000Z" }),
});

const readinessSuccessResponseSchema = z.object({
  status: z.string().openapi({ example: "ready" }),
  database: z.string().openapi({ example: "connected" }),
  redis: z.string().openapi({ example: "connected" }),
  timestamp: z.string().datetime().openapi({ example: "2026-10-08T12:00:00.000Z" }),
});

const readinessFailureResponseSchema = z.object({
  status: z.string().openapi({ example: "unhealthy" }),
  database: z.string().openapi({ example: "disconnected" }),
  redis: z.string().openapi({ example: "disconnected" }),
  timestamp: z.string().datetime().openapi({ example: "2026-10-08T12:00:00.000Z" }),
});

export const getLivenessRoute = createRoute({
  method: "get",
  path: "/live",
  tags: ["Health & System Telemetry"],
  summary: "Shallow liveness probe",
  description: "Confirms HTTP process is running, responding, and accepting connections.",
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
  description: "Verifies live connectivity to PostgreSQL database and Redis cluster. Returns 503 if unreachable.",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: readinessSuccessResponseSchema,
        },
      },
      description: "All core platform dependencies (PostgreSQL & Redis) are fully reachable and healthy.",
    },
    503: {
      content: {
        "application/json": {
          schema: readinessFailureResponseSchema,
        },
      },
      description: "One or more core platform dependencies are unreachable.",
    },
  },
});

healthRouter.openapi(getLivenessRoute, (c) => {
  return c.json(
    {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    200
  );
});

healthRouter.openapi(getReadinessRoute, async (c) => {
  let dbStatus = "disconnected";
  let redisStatus = "disconnected";

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch {
    dbStatus = "disconnected";
  }

  try {
    const redisHealth = await redisHealthCheck();
    if (redisHealth.status === "healthy") {
      redisStatus = "connected";
    }
  } catch {
    redisStatus = "disconnected";
  }

  const isReady = dbStatus === "connected" && redisStatus === "connected";
  const timestamp = new Date().toISOString();

  if (!isReady) {
    return c.json(
      {
        status: "unhealthy",
        database: dbStatus,
        redis: redisStatus,
        timestamp,
      },
      503
    );
  }

  return c.json(
    {
      status: "ready",
      database: dbStatus,
      redis: redisStatus,
      timestamp,
    },
    200
  );
});
