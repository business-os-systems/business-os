import { describe, it, expect, beforeEach, vi } from "vitest";
import { createApp } from "../src/app.js";

interface SystemVersionResponse {
  version: string;
  gitCommitSha: string;
  buildTimestamp: string;
  environment: string;
  status: string;
}

describe("System Telemetry & Versioning Routes", () => {
  const app = createApp({ enableRateLimiting: false });

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.APP_VERSION = "0.0.1";
    process.env.GIT_COMMIT_SHA = "dev";
    process.env.BUILD_TIMESTAMP = "2026-10-22T00:00:00Z";
  });

  describe("GET /api/v1/system/version", () => {
    it("returns 200 OK with authoritative semantic version and build metadata", async () => {
      const res = await app.request("/api/v1/system/version");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");

      const body = (await res.json()) as SystemVersionResponse;
      expect(body.status).toBe("ok");
      expect(body.version).toBe("0.0.1");
      expect(body.gitCommitSha).toBe("dev");
      expect(body.buildTimestamp).toBe("2026-10-22T00:00:00Z");
      expect(typeof body.environment).toBe("string");
    });

    it("is publicly accessible without requiring session authentication tokens", async () => {
      const res = await app.request("/api/v1/system/version");
      expect(res.status).toBe(200);

      const body = (await res.json()) as SystemVersionResponse;
      expect(body.version).toBeDefined();
    });

    it("dynamically returns updated version metadata when configured in environment", async () => {
      process.env.APP_VERSION = "1.2.3";
      process.env.GIT_COMMIT_SHA = "sha-abc123456";
      process.env.BUILD_TIMESTAMP = "2026-10-22T12:34:56Z";

      const res = await app.request("/api/v1/system/version");
      expect(res.status).toBe(200);

      const body = (await res.json()) as SystemVersionResponse;
      expect(body.version).toBe("1.2.3");
      expect(body.gitCommitSha).toBe("sha-abc123456");
      expect(body.buildTimestamp).toBe("2026-10-22T12:34:56Z");
    });
  });
});
