import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "@suite/db";
import * as redisModule from "@suite/redis";

interface HealthReadySuccessBody {
  status: string;
  database: string;
  redis: string;
  dependencies: {
    database: { status: string; latencyMs: number };
    redis: { status: string; latencyMs: number };
  };
  timestamp: string;
}

interface HealthReadyProblemBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  instance: string;
  database: string;
  redis: string;
  dependencies: {
    database: { status: string; latencyMs: number; error?: string };
    redis: { status: string; latencyMs: number; error?: string };
  };
  timestamp: string;
}

interface HealthLiveBody {
  status: string;
  uptime: number;
  eventLoopLagMs: number;
  timestamp: string;
}

describe("Integration: Health & Readiness Probes Under Failure Modes", () => {
  const app = createApp({ enableRateLimiting: false });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Shallow Liveness Probe (/health/live)", () => {
    it("returns 200 OK continuously without depending on external services", async () => {
      const res = await app.request("/health/live");
      expect(res.status).toBe(200);

      const body = (await res.json()) as HealthLiveBody;
      expect(body.status).toBe("ok");
      expect(body.uptime).toBeGreaterThan(0);
      expect(typeof body.eventLoopLagMs).toBe("number");
      expect(new Date(body.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe("Deep Readiness Probe (/health/ready)", () => {
    it("returns 200 OK when both PostgreSQL and Redis are responsive", async () => {
      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([{ 1: 1 }]);
      vi.spyOn(redisModule, "redisHealthCheck").mockResolvedValueOnce({
        status: "healthy",
        latencyMs: 1.2,
      });

      const res = await app.request("/health/ready");
      expect(res.status).toBe(200);

      const body = (await res.json()) as HealthReadySuccessBody;
      expect(body.status).toBe("ready");
      expect(body.database).toBe("connected");
      expect(body.redis).toBe("connected");
    });

    it("returns 503 RFC 7807 Problem Details when PostgreSQL database query times out or fails", async () => {
      vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(
        new Error("Connection terminated unexpectedly by peer")
      );

      const res = await app.request("/health/ready");
      expect(res.status).toBe(503);
      expect(res.headers.get("content-type")).toContain("application/problem+json");

      const body = (await res.json()) as HealthReadyProblemBody;
      expect(body.type).toBe("/errors/service-unavailable");
      expect(body.title).toBe("Service Unavailable");
      expect(body.status).toBe(503);
      expect(body.code).toBe("SERVICE_UNAVAILABLE");
      expect(body.instance).toBe("/health/ready");
      expect(body.database).toBe("disconnected");
      expect(body.redis).toBe("connected");
      expect(body.dependencies.database.error).toContain("Connection terminated unexpectedly");
    });

    it("returns 503 RFC 7807 Problem Details when Redis cluster fails health check", async () => {
      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([{ 1: 1 }]);
      vi.spyOn(redisModule, "redisHealthCheck").mockResolvedValueOnce({
        status: "unhealthy",
        latencyMs: 0,
        error: "CLUSTERDOWN The cluster is down",
      });

      const res = await app.request("/health/ready");
      expect(res.status).toBe(503);
      expect(res.headers.get("content-type")).toContain("application/problem+json");

      const body = (await res.json()) as HealthReadyProblemBody;
      expect(body.type).toBe("/errors/service-unavailable");
      expect(body.title).toBe("Service Unavailable");
      expect(body.status).toBe(503);
      expect(body.code).toBe("SERVICE_UNAVAILABLE");
      expect(body.instance).toBe("/health/ready");
      expect(body.database).toBe("connected");
      expect(body.redis).toBe("disconnected");
      expect(body.dependencies.redis.error).toContain("CLUSTERDOWN The cluster is down");
    });

    it("returns 503 RFC 7807 Problem Details when both PostgreSQL and Redis fail simultaneously", async () => {
      vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("DB Down"));
      vi.spyOn(redisModule, "redisHealthCheck").mockResolvedValueOnce({
        status: "unhealthy",
        latencyMs: 0,
        error: "Redis Down",
      });

      const res = await app.request("/health/ready");
      expect(res.status).toBe(503);
      expect(res.headers.get("content-type")).toContain("application/problem+json");

      const body = (await res.json()) as HealthReadyProblemBody;
      expect(body.type).toBe("/errors/service-unavailable");
      expect(body.title).toBe("Service Unavailable");
      expect(body.status).toBe(503);
      expect(body.code).toBe("SERVICE_UNAVAILABLE");
      expect(body.instance).toBe("/health/ready");
      expect(body.database).toBe("disconnected");
      expect(body.redis).toBe("disconnected");
    });
  });

  describe("Prometheus Metrics Exposition (/metrics)", () => {
    beforeEach(() => {
      process.env.METRICS_AUTH_TOKEN = "metrics-secure-telemetry-token-dev";
    });

    it("rejects unauthenticated requests to /metrics with 401", async () => {
      const res = await app.request("/metrics");
      expect(res.status).toBe(401);
    });

    it("exports HTTP request metrics conforming to Prometheus format when authenticated", async () => {
      // Send sample requests to trigger metric observation
      await app.request("/health/live");
      await app.request("/health/ready");

      const res = await app.request("/metrics", {
        headers: {
          Authorization: `Bearer ${process.env.METRICS_AUTH_TOKEN}`,
        },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");

      const rawMetrics = await res.text();
      expect(rawMetrics).toContain("# HELP suite_http_requests_total");
      expect(rawMetrics).toContain("# TYPE suite_http_requests_total counter");
      expect(rawMetrics).toContain("# HELP suite_http_request_duration_seconds");
      expect(rawMetrics).toContain("# TYPE suite_http_request_duration_seconds histogram");
      expect(rawMetrics).toContain('status="200"');
    });
  });
});
