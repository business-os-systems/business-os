import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@suite/db";
import { PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE } from "@suite/core";
import {
  CONTROL_SESSION_COOKIE_NAME,
  issueControlSession,
} from "@suite/auth/platform";
import { platformSystemRouter } from "../../../src/routes/admin/system.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createPlatformOwnerTestClient,
  createPlatformTestClient,
  platformIntegrationTestsEnabled,
} from "../../helpers/platform-db.js";

loadPlatformTestEnv();

// The health view reports the deployed build. CI sets these; local runs do not.
process.env.APP_VERSION ??= "0.0.1";
process.env.GIT_COMMIT_SHA ??= "dev";
process.env.BUILD_TIMESTAMP ??= "2026-10-22T00:00:00Z";
process.env.PLATFORM_BUILD_ID = "platform-build-test";
process.env.PLATFORM_BUILD_TIMESTAMP = "2026-11-04T00:00:00Z";

const secret = process.env.CONTROL_SESSION_SECRET;
const enabled = platformIntegrationTestsEnabled() && Boolean(secret);

type HealthBody = {
  data: {
    overall: string;
    dependencies: Array<{ name: string; state: string; criticality: string }>;
    services: Array<{ name: string; buildId: string }>;
    checkedAt: string;
  };
};

type QueuesBody = {
  data: {
    queues: Array<{ name: string; state: string; failed: number }>;
    checkedAt: string;
  };
};

describe.skipIf(!enabled)("Platform system telemetry routes", () => {
  const suffix = Date.now().toString(36);
  const operatorIds: string[] = [];
  let platformPrisma: PrismaClient;
  let ownerPrisma: PrismaClient;
  let telemetryToken: string;
  let tenantReaderToken: string;

  async function createOperator(capabilities: readonly string[]): Promise<string> {
    const operator = await platformPrisma.platformOperator.create({
      data: {
        email: `system-telemetry-${suffix}-${operatorIds.length}@example.com`,
        displayName: "Telemetry contract",
        status: "ACTIVE",
        mfaEnrolled: true,
      },
    });
    operatorIds.push(operator.id);
    for (const capability of capabilities) {
      await platformPrisma.operatorCapability.create({
        data: { operatorId: operator.id, capability },
      });
    }
    const session = await issueControlSession({
      prisma: platformPrisma,
      secret: secret ?? "",
      operatorId: operator.id,
    });
    return session.token;
  }

  function get(path: string, token: string): Promise<Response> {
    return Promise.resolve(
      platformSystemRouter.request(path, {
        headers: {
          Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${token}`,
          "X-Forwarded-For": "198.51.100.15",
        },
      })
    );
  }

  beforeAll(async () => {
    platformSystemRouter.onError(globalErrorHandler);
    platformPrisma = createPlatformTestClient();
    ownerPrisma = createPlatformOwnerTestClient();
    await clearRateLimitStore("rl:admin:system");
    telemetryToken = await createOperator([
      PLATFORM_CAPABILITIES.TELEMETRY_READ.code,
    ]);
    tenantReaderToken = await createOperator([
      PLATFORM_CAPABILITIES.TENANTS_READ.code,
    ]);
  });

  afterAll(async () => {
    await ownerPrisma.operatorCapability.deleteMany({
      where: { operatorId: { in: operatorIds } },
    });
    await ownerPrisma.platformOperator.deleteMany({
      where: { id: { in: operatorIds } },
    });
    await platformPrisma.$disconnect();
    await ownerPrisma.$disconnect();
  });

  it("returns aggregate health with a state per dependency", async () => {
    const response = await get("/health", telemetryToken);
    expect(response.status).toBe(200);

    const body = (await response.json()) as HealthBody;
    expect(["healthy", "degraded", "unavailable"]).toContain(body.data.overall);
    expect(body.data.dependencies.map((dependency) => dependency.name)).toEqual([
      "database",
      "cache",
      "background-processing",
    ]);
    expect(body.data.dependencies[0]?.criticality).toBe("critical");
    expect(body.data.services.map((service) => service.name)).toEqual([
      "api",
      "platform-dashboard",
    ]);
    expect(new Date(body.data.checkedAt).toISOString()).toBe(body.data.checkedAt);
  });

  it("returns both registered queues with their counts", async () => {
    const response = await get("/queues", telemetryToken);
    expect(response.status).toBe(200);

    const body = (await response.json()) as QueuesBody;
    const names = body.data.queues.map((queue) => queue.name);
    expect(names).toContain("email-queue");
    expect(names).toContain("platform-outbox");
    for (const queue of body.data.queues) {
      expect(["healthy", "degraded", "unavailable"]).toContain(queue.state);
      expect(queue.failed === null || queue.failed >= 0).toBe(true);
    }
  });

  it("denies an operator without the telemetry capability", async () => {
    const response = await get("/health", tenantReaderToken);
    expect(response.status).toBe(403);

    const body = (await response.json()) as { code: string; type: string };
    expect(body.code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
    expect(body.type).toBe("/errors/capability-denied");
  });
});
