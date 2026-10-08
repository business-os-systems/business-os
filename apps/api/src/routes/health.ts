import { Hono } from "hono";
import { prisma } from "@suite/db";
import { redisHealthCheck } from "@suite/redis";
import { metricsRegistry } from "../telemetry.js";

export const healthRouter = new Hono();

/**
 * GET /health/live - Shallow liveness probe.
 * Confirms process is alive and accepting incoming requests.
 */
healthRouter.get("/live", (c) => {
  return c.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/ready - Deep readiness probe.
 * Verifies live connectivity to PostgreSQL database and Redis cluster.
 * Returns 503 Service Unavailable if either dependency is unreachable.
 */
healthRouter.get("/ready", async (c) => {
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

  return c.json({
    status: "ready",
    database: dbStatus,
    redis: redisStatus,
    timestamp,
  });
});

/**
 * GET /metrics - Prometheus telemetry scraping endpoint.
 */
healthRouter.get("/metrics", async (c) => {
  const metrics = await metricsRegistry.metrics();
  c.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  return c.text(metrics);
});
