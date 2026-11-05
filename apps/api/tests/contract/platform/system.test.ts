import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { PrismaClient } from "@suite/db";
import { PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE } from "@suite/core";
import {
  CONTROL_SESSION_COOKIE_NAME,
  issueControlSession,
} from "@suite/auth/platform";
import { readPlatformRuntimeConfig } from "../../../src/lib/platform-env.js";
import { UNKNOWN_SERVICE_VERSION } from "../../../src/services/admin/health.service.js";
import { getEmailQueue } from "@suite/redis";
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
process.env.PLATFORM_BUILD_ID = "platform-build-contract";
process.env.PLATFORM_BUILD_TIMESTAMP = "2026-11-05T00:00:00Z";

const ERROR_CONSOLE_URL = "https://errors.example.com/console";
process.env.PLATFORM_ERROR_TRACKING_URL = ERROR_CONSOLE_URL;

const secret = process.env.CONTROL_SESSION_SECRET;
const enabled = platformIntegrationTestsEnabled() && Boolean(secret);

/**
 * The contract is restated here rather than imported from the route schemas: a
 * shared schema would only prove that the route agrees with itself.
 */
const timestampSchema = z.string().datetime();
const healthStateSchema = z.enum(["healthy", "degraded", "unavailable"]);

const dependencySchema = z
  .object({
    name: z.string().min(1),
    state: healthStateSchema,
    criticality: z.enum(["critical", "supporting"]),
    latencyMs: z.number().nullable(),
    lastCheckedAt: timestampSchema,
    detail: z.string().min(1),
  })
  .strict();

const serviceSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    buildId: z.string().min(1),
    buildTimestamp: z.string().min(1),
    environment: z.string().min(1),
  })
  .strict();

const healthSchema = z
  .object({
    overall: healthStateSchema,
    dependencies: z.array(dependencySchema),
    services: z.array(serviceSchema),
    version: z.string().min(1),
    buildTimestamp: z.string().min(1),
    environment: z.string().min(1),
    errorTrackingUrl: z.string().url().nullable(),
    checkedAt: timestampSchema,
  })
  .strict();

const queueSchema = z
  .object({
    name: z.string().min(1),
    kind: z.enum(["bullmq", "outbox"]),
    waiting: z.number().int().nonnegative().nullable(),
    active: z.number().int().nonnegative().nullable(),
    failed: z.number().int().nonnegative().nullable(),
    delayed: z.number().int().nonnegative().nullable(),
    oldestFailedAgeMs: z.number().int().nonnegative().nullable(),
    state: healthStateSchema,
    detail: z.string().min(1),
  })
  .strict();

const queuesSchema = z
  .object({ queues: z.array(queueSchema), checkedAt: timestampSchema })
  .strict();

const envelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z
    .object({
      success: z.literal(true),
      data,
      requestId: z.string().min(1),
      timestamp: z.string(),
    })
    .strict();

const healthEnvelopeSchema = envelopeSchema(healthSchema);
const queuesEnvelopeSchema = envelopeSchema(queuesSchema);

const problemSchema = z
  .object({
    type: z.string().regex(/^\/errors\//),
    title: z.string().min(1),
    status: z.number().int(),
    detail: z.string().min(1),
    code: z.string().min(1),
  })
  .passthrough();

const DEPENDENCY_NAMES = ["database", "cache", "background-processing"];

const suffix = Date.now().toString(36);
const operatorIds: string[] = [];
let platformPrisma: PrismaClient;
let ownerPrisma: PrismaClient;
let telemetryToken = "";
let tenantReaderToken = "";

async function createOperator(capabilities: readonly string[]): Promise<string> {
  const operator = await platformPrisma.platformOperator.create({
    data: {
      email: `system-contract-${suffix}-${operatorIds.length}@example.com`,
      displayName: "System contract",
      status: "ACTIVE",
      mfaEnrolled: true,
    },
  });
  operatorIds.push(operator.id);
  await platformPrisma.operatorCapability.createMany({
    data: capabilities.map((capability) => ({
      operatorId: operator.id,
      capability,
    })),
  });
  const session = await issueControlSession({
    prisma: platformPrisma,
    secret: secret ?? "",
    operatorId: operator.id,
  });
  return session.token;
}

function get(path: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "X-Forwarded-For": "198.51.100.31",
  };
  if (token !== undefined) {
    headers.Cookie = `${CONTROL_SESSION_COOKIE_NAME}=${token}`;
  }
  return Promise.resolve(platformSystemRouter.request(path, { headers }));
}

function dependency(
  body: z.infer<typeof healthSchema>,
  name: string
): z.infer<typeof dependencySchema> {
  const found = body.dependencies.find((entry) => entry.name === name);
  if (found === undefined) {
    throw new Error(`Dependency ${name} missing from the health contract`);
  }
  return found;
}

beforeAll(async () => {
  if (!enabled) {
    return;
  }
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
  if (!enabled) {
    return;
  }
  await ownerPrisma.operatorCapability.deleteMany({
    where: { operatorId: { in: operatorIds } },
  });
  await ownerPrisma.platformOperator.deleteMany({
    where: { id: { in: operatorIds } },
  });
  await platformPrisma.$disconnect();
  await ownerPrisma.$disconnect();
});

describe.skipIf(!enabled)("Platform system health contract", () => {
  it("keeps the success envelope contract", async () => {
    const response = await get("/health", telemetryToken);

    expect(response.status).toBe(200);
    const body = healthEnvelopeSchema.parse(await response.json());
    expect(body.success).toBe(true);
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it("names every probed dependency with its own state and check time", async () => {
    const response = await get("/health", telemetryToken);
    const body = healthEnvelopeSchema.parse(await response.json());

    expect(body.data.dependencies.map((entry) => entry.name)).toEqual(
      DEPENDENCY_NAMES
    );
    for (const entry of body.data.dependencies) {
      expect(entry.detail.length).toBeGreaterThan(0);
      expect(entry.latencyMs === null || entry.latencyMs >= 0).toBe(true);
    }
    expect(dependency(body.data, "database").criticality).toBe("critical");
    expect(dependency(body.data, "cache").criticality).toBe("supporting");
    expect(dependency(body.data, "background-processing").criticality).toBe(
      "supporting"
    );
  });

  it("reports a build identity for every service without inventing a version", async () => {
    const response = await get("/health", telemetryToken);
    const body = healthEnvelopeSchema.parse(await response.json());

    expect(body.data.services.map((service) => service.name)).toEqual([
      "api",
      "platform-dashboard",
    ]);
    const api = body.data.services.find((service) => service.name === "api");
    const dashboard = body.data.services.find(
      (service) => service.name === "platform-dashboard"
    );
    expect(api?.version).toBe(body.data.version);
    // FR-034: the dashboard's own version is not configured, so it is reported
    // as unknown rather than inheriting the API's version.
    expect(dashboard?.version).toBe(UNKNOWN_SERVICE_VERSION);
    expect(body.data.errorTrackingUrl).toBe(ERROR_CONSOLE_URL);
  });
});

describe.skipIf(!enabled)("Platform system queue contract", () => {
  it("keeps the queue envelope and registry contract", async () => {
    const response = await get("/queues", telemetryToken);

    expect(response.status).toBe(200);
    const body = queuesEnvelopeSchema.parse(await response.json());
    expect(body.data.queues.map((queue) => queue.name).sort()).toEqual([
      "email-queue",
      "platform-outbox",
    ]);
  });

  it("reports null counts for an unreadable queue instead of a fabricated zero", async () => {
    const counts = vi
      .spyOn(getEmailQueue(), "getJobCounts")
      .mockRejectedValue(new Error("connect ECONNREFUSED"));

    let body: z.infer<typeof queuesEnvelopeSchema>;
    try {
      const response = await get("/queues", telemetryToken);
      expect(response.status).toBe(200);
      body = queuesEnvelopeSchema.parse(await response.json());
    } finally {
      counts.mockRestore();
    }

    const email = body.data.queues.find((queue) => queue.name === "email-queue");
    expect(email?.state).toBe("unavailable");
    expect(email?.waiting).toBeNull();
    expect(email?.active).toBeNull();
    expect(email?.failed).toBeNull();
    expect(email?.delayed).toBeNull();
  });
});

describe.skipIf(!enabled)("Platform system error contract", () => {
  it("returns RFC 7807 problem details to an anonymous caller", async () => {
    const response = await get("/health");

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json"
    );
    const problem = problemSchema.parse(await response.json());
    expect(problem.status).toBe(401);
    expect(problem.code).toBe(PLATFORM_ERROR_CODE.AUTH_REQUIRED);
  });

  it("denies an operator without platform:telemetry:read", async () => {
    const response = await get("/queues", tenantReaderToken);

    expect(response.status).toBe(403);
    const problem = problemSchema.parse(await response.json());
    expect(problem.status).toBe(403);
    expect(problem.code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
    expect(problem.type).toBe("/errors/capability-denied");
  });
});
describe("Error console configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves the configured console URL", () => {
    vi.stubEnv("PLATFORM_ERROR_TRACKING_URL", ERROR_CONSOLE_URL);

    expect(readPlatformRuntimeConfig().errorTrackingUrl).toBe(ERROR_CONSOLE_URL);
  });

  it("treats a non-http(s) value as unset instead of throwing", () => {
    vi.stubEnv("PLATFORM_ERROR_TRACKING_URL", "javascript:alert(1)");

    expect(readPlatformRuntimeConfig().errorTrackingUrl).toBeNull();
  });

  it("treats embedded credentials as unset", () => {
    vi.stubEnv(
      "PLATFORM_ERROR_TRACKING_URL",
      "https://user:pass@errors.example.com/console"
    );

    expect(readPlatformRuntimeConfig().errorTrackingUrl).toBeNull();
  });

  it("reports null when the deployment declares no console", () => {
    vi.stubEnv("PLATFORM_ERROR_TRACKING_URL", "");

    expect(readPlatformRuntimeConfig().errorTrackingUrl).toBeNull();
  });
});
