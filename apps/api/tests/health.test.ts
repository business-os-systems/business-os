import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "@suite/db";
import * as redisModule from "@suite/redis";

interface HealthLiveResponse {
  status: string;
  uptime: number;
  timestamp: string;
}

interface HealthReadyResponse {
  status: string;
  database: string;
  redis: string;
  timestamp: string;
}

describe("Health & Telemetry Routes", () => {
  const app = createApp({ enableRateLimiting: false });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /health/live", () => {
    it("returns 200 OK with shallow liveness uptime data", async () => {
      const res = await app.request("/health/live");
      expect(res.status).toBe(200);

      const body = (await res.json()) as HealthLiveResponse;
      expect(body.status).toBe("ok");
      expect(typeof body.uptime).toBe("number");
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

      const body = (await res.json()) as HealthReadyResponse;
      expect(body.status).toBe("ready");
      expect(body.database).toBe("connected");
      expect(body.redis).toBe("connected");
    });

    it("returns 503 Service Unavailable when PostgreSQL fails", async () => {
      vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("DB Connection Refused"));
      vi.spyOn(redisModule, "redisHealthCheck").mockResolvedValueOnce({
        status: "healthy",
        latencyMs: 1.2,
      });

      const res = await app.request("/health/ready");
      expect(res.status).toBe(503);

      const body = (await res.json()) as HealthReadyResponse;
      expect(body.status).toBe("unhealthy");
      expect(body.database).toBe("disconnected");
      expect(body.redis).toBe("connected");
    });

    it("returns 503 Service Unavailable when Redis is unhealthy", async () => {
      vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([{ 1: 1 }]);
      vi.spyOn(redisModule, "redisHealthCheck").mockResolvedValueOnce({
        status: "unhealthy",
        latencyMs: 0,
        error: "ECONNREFUSED",
      });

      const res = await app.request("/health/ready");
      expect(res.status).toBe(503);

      const body = (await res.json()) as HealthReadyResponse;
      expect(body.status).toBe("unhealthy");
      expect(body.database).toBe("connected");
      expect(body.redis).toBe("disconnected");
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
