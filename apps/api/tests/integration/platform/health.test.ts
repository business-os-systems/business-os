import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { PrismaClient } from "@suite/db";
import { getEmailQueue } from "@suite/redis";
import { PLATFORM_CAPABILITIES } from "@suite/core";
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

process.env.APP_VERSION ??= "0.0.1";
process.env.GIT_COMMIT_SHA ??= "dev";
process.env.BUILD_TIMESTAMP ??= "2026-10-22T00:00:00Z";

const secret = process.env.CONTROL_SESSION_SECRET;
const enabled = platformIntegrationTestsEnabled() && Boolean(secret);

const timestampSchema = z.string().datetime();
const healthStateSchema = z.enum(["healthy", "degraded", "unavailable"]);
const countSchema = z.number().int().nonnegative().nullable();

const dependencySchema = z
  .object({
    name: z.string(),
    state: healthStateSchema,
    criticality: z.enum(["critical", "supporting"]),
    latencyMs: z.number().nullable(),
    lastCheckedAt: timestampSchema,
    detail: z.string(),
  })
  .passthrough();

const healthSchema = z
  .object({
    overall: healthStateSchema,
    dependencies: z.array(dependencySchema),
    checkedAt: timestampSchema,
  })
  .passthrough();

const queueSchema = z
  .object({
    name: z.string(),
    state: healthStateSchema,
    waiting: countSchema,
    active: countSchema,
    failed: countSchema,
    delayed: countSchema,
    oldestFailedAgeMs: countSchema,
    detail: z.string(),
  })
  .passthrough();

const healthEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: healthSchema,
  })
  .passthrough();

const queuesEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: z.object({ queues: z.array(queueSchema) }).passthrough(),
  })
  .passthrough();

const EMAIL_QUEUE_NAME = "email-queue";

type HealthSnapshot = z.infer<typeof healthSchema>;
type DependencyView = z.infer<typeof dependencySchema>;
type QueueView = z.infer<typeof queueSchema>;

const suffix = Date.now().toString(36);
const operatorIds: string[] = [];
let platformPrisma: PrismaClient;
let ownerPrisma: PrismaClient;
let token = "";

function findDependency(body: HealthSnapshot, name: string): DependencyView {
  const found = body.dependencies.find((entry) => entry.name === name);
  if (found === undefined) {
    throw new Error(`Dependency ${name} missing from the health view`);
  }
  return found;
}

function findQueue(
  body: z.infer<typeof queuesEnvelopeSchema>["data"],
  name: string
): QueueView {
  const found = body.queues.find((entry) => entry.name === name);
  if (found === undefined) {
    throw new Error(`Queue ${name} missing from the queue view`);
  }
  return found;
}

async function readHealth(): Promise<HealthSnapshot> {
  const response = await get("/health");
  expect(response.status).toBe(200);
  return healthEnvelopeSchema.parse(await response.json()).data;
}

async function readQueues(): Promise<z.infer<typeof queuesEnvelopeSchema>["data"]> {
  const response = await get("/queues");
  expect(response.status).toBe(200);
  return queuesEnvelopeSchema.parse(await response.json()).data;
}

function get(path: string): Promise<Response> {
  return Promise.resolve(
    platformSystemRouter.request(path, {
      headers: {
        Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${token}`,
        "X-Forwarded-For": "198.51.100.32",
      },
    })
  );
}

function breakQueueBackend(): void {
  vi.spyOn(getEmailQueue(), "getJobCounts").mockRejectedValue(
    new Error("connect ECONNREFUSED 127.0.0.1:6379")
  );
}

beforeAll(async () => {
  if (!enabled) {
    return;
  }
  platformSystemRouter.onError(globalErrorHandler);
  platformPrisma = createPlatformTestClient();
  ownerPrisma = createPlatformOwnerTestClient();
  await clearRateLimitStore("rl:admin:system");

  const operator = await platformPrisma.platformOperator.create({
    data: {
      email: `system-health-${suffix}@example.com`,
      displayName: "Health contract",
      status: "ACTIVE",
      mfaEnrolled: true,
    },
  });
  operatorIds.push(operator.id);
  await platformPrisma.operatorCapability.create({
    data: {
      operatorId: operator.id,
      capability: PLATFORM_CAPABILITIES.TELEMETRY_READ.code,
    },
  });
  const session = await issueControlSession({
    prisma: platformPrisma,
    secret: secret ?? "",
    operatorId: operator.id,
  });
  token = session.token;
});

afterEach(() => {
  vi.restoreAllMocks();
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

describe.skipIf(!enabled)("Degraded queue dependency", () => {
  it("degrades the platform without claiming health when a queue cannot be read", async () => {
    breakQueueBackend();

    const body = await readHealth();

    expect(body.overall).toBe("degraded");
    const background = findDependency(body, "background-processing");
    expect(background.state).toBe("degraded");
    expect(background.detail).toContain(EMAIL_QUEUE_NAME);
    expect(findDependency(body, "database").state).not.toBe("unavailable");
  });

  it("reports null counts instead of a fabricated zero for an unreachable queue", async () => {
    breakQueueBackend();

    const email = findQueue(await readQueues(), EMAIL_QUEUE_NAME);

    expect(email.state).toBe("unavailable");
    expect(email.waiting).toBeNull();
    expect(email.active).toBeNull();
    expect(email.failed).toBeNull();
    expect(email.delayed).toBeNull();
  });
});

describe.skipIf(!enabled)("Queue backlog visibility", () => {
  it("surfaces failed background work and the backlog through the queue view", async () => {
    vi.spyOn(getEmailQueue(), "getJobCounts").mockResolvedValue({
      waiting: 2,
      active: 1,
      failed: 3,
      delayed: 0,
    });

    const email = findQueue(await readQueues(), EMAIL_QUEUE_NAME);

    expect(email.failed).toBe(3);
    expect(email.waiting).toBe(2);
    expect(email.state).toBe("degraded");
    expect(email.detail).toContain("3 failed email job(s)");
  });
});

describe.skipIf(!enabled)("Recovery", () => {
  it("reports the queue healthy again once it answers", async () => {
    vi.spyOn(getEmailQueue(), "getJobCounts").mockRejectedValue(
      new Error("connect ECONNREFUSED")
    );
    expect(findQueue(await readQueues(), EMAIL_QUEUE_NAME).state).toBe(
      "unavailable"
    );

    vi.restoreAllMocks();
    vi.spyOn(getEmailQueue(), "getJobCounts").mockResolvedValue({
      waiting: 0,
      active: 0,
      failed: 0,
      delayed: 0,
    });

    const recovered = findQueue(await readQueues(), EMAIL_QUEUE_NAME);
    expect(recovered.state).toBe("healthy");
    expect(recovered.failed).toBe(0);
  });
});