import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "@suite/db";
import * as redisModule from "@suite/redis";

interface HealthLiveResponse {
  status: string;
  uptime: number;
  eventLoopLagMs: number;
  timestamp: string;
}

interface DependencyProbeInfo {
  status: "connected" | "disconnected";
  latencyMs: number;
  error?: string;
}

interface HealthReadySuccessResponse {
  status: string;
  database: string;
  redis: string;
  dependencies: {
    database: DependencyProbeInfo;
    redis: DependencyProbeInfo;
  };
  timestamp: string;
}

interface HealthReadyProblemResponse {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  instance: string;
  database: string;
  redis: string;
  dependencies: {
    database: DependencyProbeInfo;
    redis: DependencyProbeInfo;
  };
  timestamp: string;
}

describe("Health & Telemetry Routes", () => {
  const app = createApp({ enableRateLimiting: false });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /health/live", () => {
    it("returns 200 OK with process uptime and event loop lag measurement", async () => {
      const res = await app.request("/health/live");
      expect(res.status).toBe(200);

      const body = (await res.json()) as HealthLiveResponse;
      expect(body.status).toBe("ok");
      expect(typeof body.uptime).toBe("number");
      expect(body.uptime).toBeGreaterThan(0);
      expect(typeof body.eventLoopLagMs).toBe("number");
      expect(body.eventLoopLagMs).toBeGreaterThanOrEqual(0);
      expect(typeof body.timestamp).toBe("string");
    });
  });

  describe("GET /health/ready", () => {
    it("returns 200 OK when both PostgreSQL and Redis are healthy", async () => {
      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([{ 1: 1 }]);
      vi.spyOn(redisModule, "redisHealthCheck").mockResolvedValueOnce({
        status: "healthy",
        latencyMs: 1.2,
      });

      const res = await app.request("/health/ready");
      expect(res.status).toBe(200);

      const body = (await res.json()) as HealthReadySuccessResponse;
      expect(body.status).toBe("ready");
      expect(body.database).toBe("connected");
      expect(body.redis).toBe("connected");
      expect(body.dependencies.database.status).toBe("connected");
      expect(typeof body.dependencies.database.latencyMs).toBe("number");
      expect(body.dependencies.redis.status).toBe("connected");
      expect(typeof body.dependencies.redis.latencyMs).toBe("number");
    });

    it("returns 503 RFC 7807 Problem Details when PostgreSQL database fails", async () => {
      vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("DB Connection Refused"));
      vi.spyOn(redisModule, "redisHealthCheck").mockResolvedValueOnce({
        status: "healthy",
        latencyMs: 1.2,
      });

      const res = await app.request("/health/ready");
      expect(res.status).toBe(503);
      expect(res.headers.get("content-type")).toContain("application/problem+json");

      const body = (await res.json()) as HealthReadyProblemResponse;
      expect(body.type).toBe("/errors/service-unavailable");
      expect(body.title).toBe("Service Unavailable");
      expect(body.status).toBe(503);
      expect(body.code).toBe("SERVICE_UNAVAILABLE");
      expect(body.instance).toBe("/health/ready");
      expect(body.database).toBe("disconnected");
      expect(body.redis).toBe("connected");
      expect(body.dependencies.database.error).toContain("DB Connection Refused");
    });

    it("returns 503 RFC 7807 Problem Details when Redis is unhealthy", async () => {
      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([{ 1: 1 }]);
      vi.spyOn(redisModule, "redisHealthCheck").mockResolvedValueOnce({
        status: "unhealthy",
        latencyMs: 0,
        error: "ECONNREFUSED",
      });

      const res = await app.request("/health/ready");
      expect(res.status).toBe(503);
      expect(res.headers.get("content-type")).toContain("application/problem+json");

      const body = (await res.json()) as HealthReadyProblemResponse;
      expect(body.type).toBe("/errors/service-unavailable");
      expect(body.title).toBe("Service Unavailable");
      expect(body.status).toBe(503);
      expect(body.code).toBe("SERVICE_UNAVAILABLE");
      expect(body.database).toBe("connected");
      expect(body.redis).toBe("disconnected");
      expect(body.dependencies.redis.error).toContain("ECONNREFUSED");
    });

    it("ignores optional third-party service failures (e.g. Sentry) and succeeds when core dependencies pass", async () => {
      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([{ 1: 1 }]);
      vi.spyOn(redisModule, "redisHealthCheck").mockResolvedValueOnce({
        status: "healthy",
        latencyMs: 0.8,
      });

      const res = await app.request("/health/ready");
      expect(res.status).toBe(200);

      const body = (await res.json()) as HealthReadySuccessResponse;
      expect(body.status).toBe("ready");
      expect(body.database).toBe("connected");
      expect(body.redis).toBe("connected");
    });
  });

  describe("GET /metrics (Telemetry Authentication Guard)", () => {
    beforeEach(() => {
      process.env.METRICS_AUTH_TOKEN = "metrics-secure-telemetry-token-dev";
    });

    it("rejects anonymous unauthenticated requests to /metrics with 401", async () => {
      const res = await app.request("/metrics");
      expect(res.status).toBe(401);

      const json = (await res.json()) as { code: string };
      expect(json.code).toBe("METRICS_AUTH_REQUIRED");
    });

    it("returns Prometheus text formatted metrics with status 200 when authenticated", async () => {
      const token = process.env.METRICS_AUTH_TOKEN ?? "metrics-secure-telemetry-token-dev";
      const res = await app.request("/metrics", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");

      const body = await res.text();
      expect(body).toContain("http_requests_total");
      expect(body).toContain("http_request_duration_seconds");
    });
  });
});
