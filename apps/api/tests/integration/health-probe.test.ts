import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "@suite/db";
import * as redisModule from "@suite/redis";

interface HealthReadyBody {
  status: string;
  database: string;
  redis: string;
  timestamp: string;
}

interface HealthLiveBody {
  status: string;
  uptime: number;
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
      expect(new Date(body.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe("Deep Readiness Probe (/health/ready)", () => {
    it("returns 200 OK when both PostgreSQL and Redis are responsive", async () => {
      const res = await app.request("/health/ready");
      expect(res.status).toBe(200);

      const body = (await res.json()) as HealthReadyBody;
      expect(body.status).toBe("ready");
      expect(body.database).toBe("connected");
      expect(body.redis).toBe("connected");
    });

    it("returns 503 Service Unavailable when PostgreSQL database query times out or fails", async () => {
      vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(
        new Error("Connection terminated unexpectedly by peer")
      );

      const res = await app.request("/health/ready");
      expect(res.status).toBe(503);

      const body = (await res.json()) as HealthReadyBody;
      expect(body.status).toBe("unhealthy");
      expect(body.database).toBe("disconnected");
      expect(body.redis).toBe("connected");
    });

    it("returns 503 Service Unavailable when Redis cluster fails health check", async () => {
      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([{ 1: 1 }]);
      vi.spyOn(redisModule, "redisHealthCheck").mockResolvedValueOnce({
        status: "unhealthy",
        latencyMs: 0,
        error: "CLUSTERDOWN The cluster is down",
      });

      const res = await app.request("/health/ready");
      expect(res.status).toBe(503);

      const body = (await res.json()) as HealthReadyBody;
      expect(body.status).toBe("unhealthy");
      expect(body.database).toBe("connected");
      expect(body.redis).toBe("disconnected");
    });

    it("returns 503 Service Unavailable when both PostgreSQL and Redis fail simultaneously", async () => {
      vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("DB Down"));
      vi.spyOn(redisModule, "redisHealthCheck").mockResolvedValueOnce({
        status: "unhealthy",
        latencyMs: 0,
        error: "Redis Down",
      });

      const res = await app.request("/health/ready");
      expect(res.status).toBe(503);

      const body = (await res.json()) as HealthReadyBody;
      expect(body.status).toBe("unhealthy");
      expect(body.database).toBe("disconnected");
      expect(body.redis).toBe("disconnected");
    });
  });

  describe("Prometheus Metrics Exposition (/metrics)", () => {
    it("exports HTTP request metrics conforming to Prometheus format", async () => {
      // Send sample requests to trigger metric observation
      await app.request("/health/live");
      await app.request("/health/ready");

      const res = await app.request("/metrics");
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
