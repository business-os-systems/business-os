import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET as getSystemVersion } from "../src/app/api/v1/system/version/route";

describe("Dashboard System Version API (GET /api/v1/system/version)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.APP_VERSION = "0.0.1";
    process.env.GIT_COMMIT_SHA = "dev";
    process.env.BUILD_TIMESTAMP = "2026-10-22T00:00:00Z";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 200 OK with authoritative semantic version and metadata", async () => {
    const response = await getSystemVersion();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toEqual({
      version: "0.0.1",
      gitCommitSha: "dev",
      buildTimestamp: "2026-10-22T00:00:00Z",
      environment: process.env.NODE_ENV,
      status: "ok",
    });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("dynamically returns modified version environment metadata without static fallbacks", async () => {
    process.env.APP_VERSION = "2.0.0";
    process.env.GIT_COMMIT_SHA = "commit-998877";
    process.env.BUILD_TIMESTAMP = "2026-10-22T15:00:00Z";

    const response = await getSystemVersion();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.version).toBe("2.0.0");
    expect(data.gitCommitSha).toBe("commit-998877");
    expect(data.buildTimestamp).toBe("2026-10-22T15:00:00Z");
  });
});
