import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@suite/db";
import { getEmailQueue } from "@suite/redis";
import {
  readPlatformHealth,
  type HealthProbes,
  type ProbeResult,
} from "../../../src/services/admin/health.service.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createPlatformTestClient,
  platformIntegrationTestsEnabled,
} from "../../helpers/platform-db.js";

loadPlatformTestEnv();

process.env.APP_VERSION ??= "0.0.1";
process.env.GIT_COMMIT_SHA ??= "dev";
process.env.BUILD_TIMESTAMP ??= "2026-10-22T00:00:00Z";

const enabled = platformIntegrationTestsEnabled();

const HEALTHY_PROBE: () => Promise<ProbeResult> = () =>
  Promise.resolve({ status: "connected", latencyMs: 1 });

function failingProbe(): Promise<ProbeResult> {
  return Promise.resolve({
    status: "disconnected",
    latencyMs: 1,
    error: "connect ECONNREFUSED",
  });
}

const HEALTHY_CACHE: HealthProbes["cache"] = HEALTHY_PROBE;
const FAILING_CACHE: HealthProbes["cache"] = failingProbe;
const HEALTHY_DATABASE: HealthProbes["database"] = HEALTHY_PROBE;
const FAILING_DATABASE: HealthProbes["database"] = failingProbe;

let platformPrisma: PrismaClient;

/**
 * US3 AC2 names the cache explicitly, and FR-032 keeps a datastore outage
 * distinct from a supporting one. Both are exercised through the same
 * readPlatformHealth seam the system route calls, with injected probes - no
 * module mocking, so the test proves a state production can actually reach.
 */
describe.skipIf(!enabled)("Health dependency outage", () => {
  beforeAll(() => {
    platformPrisma = createPlatformTestClient();
  });

  afterAll(async () => {
    await platformPrisma.$disconnect();
  });

  function read(probes: HealthProbes) {
    return readPlatformHealth({
      platformPrisma,
      emailQueue: getEmailQueue(),
      probes,
    });
  }

  it("degrades the platform and names the cache when it is unreachable", async () => {
    const health = await read({
      database: HEALTHY_DATABASE,
      cache: FAILING_CACHE,
    });

    expect(health.overall).toBe("degraded");
    const cache = health.dependencies.find((entry) => entry.name === "cache");
    expect(cache?.state).toBe("unavailable");
    expect(cache?.criticality).toBe("supporting");
    expect(cache?.detail).toContain("unreachable");
  });

  it("reports unavailable, not degraded, when the critical datastore fails", async () => {
    const health = await read({
      database: FAILING_DATABASE,
      cache: HEALTHY_CACHE,
    });

    expect(health.overall).toBe("unavailable");
    const database = health.dependencies.find((entry) => entry.name === "database");
    expect(database?.state).toBe("unavailable");
    expect(database?.criticality).toBe("critical");
  });
});
