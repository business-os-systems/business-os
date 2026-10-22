import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "@suite/db";
import { redisHealthCheck } from "@suite/redis";
import { performance } from "node:perf_hooks";

export const healthRouter = new OpenAPIHono();

export const DEFAULT_PROBE_TIMEOUT_MS = 150;

export interface ProbeResult {
  readonly status: "connected" | "disconnected";
  readonly latencyMs: number;
  readonly error?: string;
}

export async function measureEventLoopLag(): Promise<number> {
  const start = performance.now();
  await new Promise((resolve) => setImmediate(resolve));
  return Math.round((performance.now() - start) * 100) / 100;
}

export async function probeDatabase(timeoutMs = DEFAULT_PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  const start = performance.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Database probe timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    await Promise.race([prisma.$queryRaw`SELECT 1`, timeoutPromise]);
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;
    return { status: "connected", latencyMs };
  } catch (err) {
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;
    return {
      status: "disconnected",
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function probeRedis(timeoutMs = DEFAULT_PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  const start = performance.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Redis probe timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    const result = await Promise.race([redisHealthCheck(), timeoutPromise]);
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;

    if (result.status === "healthy") {
      return { status: "connected", latencyMs: result.latencyMs };
    }
    return {
      status: "disconnected",
      latencyMs,
      error: result.error,
    };
  } catch (err) {
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;
    return {
      status: "disconnected",
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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

const dependencyProbeFailureSchema = z.object({
  status: z.enum(["connected", "disconnected"]),
  latencyMs: z.number().openapi({ description: "Probe latency in milliseconds", example: 1.2 }),
  error: z.string().optional().openapi({ description: "Sanitized error message if failed" }),
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
    database: dependencyProbeFailureSchema,
    redis: dependencyProbeFailureSchema,
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
          database: dbResult,
          redis: redisResult,
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
