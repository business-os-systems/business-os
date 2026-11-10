import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@suite/db";
import { PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE } from "@suite/core";
import { CONTROL_SESSION_COOKIE_NAME, issueControlSession, PLATFORM_AUDIT_ACTIONS } from "@suite/auth/platform";
import { IDEMPOTENCY_HEADER } from "@suite/redis";
import { tenantLifecycleRouter } from "../../../src/routes/admin/lifecycle.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import { createPlatformOwnerTestClient, createPlatformTestClient, platformIntegrationTestsEnabled } from "../../helpers/platform-db.js";
import { platformTestRpId } from "../../helpers/platform-rp.js";

loadPlatformTestEnv();

const secret = process.env.CONTROL_SESSION_SECRET;
const enabled = platformIntegrationTestsEnabled() && Boolean(secret);

type ProblemBody = { type: string; status: number; code: string };
type LifecycleData = {
  fromStatus: string;
  toStatus: string;
  lifecycleEventId: string;
  occurredAt: string;
};

describe.skipIf(!enabled)("Platform tenant lifecycle contract", () => {
  const suffix = Date.now().toString(36);
  const operatorIds: string[] = [];
  const orgIds: string[] = [];
  let platformPrisma: PrismaClient;
  let ownerPrisma: PrismaClient;
  let operatorToken: string;
  let readerToken: string;
  let keyCounter = 0;

  async function createOperator(capabilities: readonly string[]): Promise<string> {
    const operator = await platformPrisma.platformOperator.create({
      data: { email: `lifecycle-contract-${suffix}-${operatorIds.length}@example.com`, displayName: "Contract", status: "ACTIVE", mfaEnrolled: true },
    });
    operatorIds.push(operator.id);
    for (const capability of capabilities) {
      await platformPrisma.operatorCapability.create({ data: { operatorId: operator.id, capability } });
    }
    return (await issueControlSession({ prisma: platformPrisma, secret: secret ?? "", rpID: platformTestRpId(), operatorId: operator.id })).token;
  }

  async function createTenant(): Promise<{ id: string; slug: string }> {
    const slug = `lifecycle-contract-${suffix}-${orgIds.length}`;
    const organization = await ownerPrisma.organization.create({ data: { name: `Contract ${slug}`, slug, status: "ACTIVE" } });
    orgIds.push(organization.id);
    return { id: organization.id, slug };
  }

  function controlPlaneOrigin(): string {
    const value = process.env.CONTROL_PLANE_ORIGIN;
    if (value === undefined || value.trim() === "") {
      throw new Error("CONTROL_PLANE_ORIGIN must be set for lifecycle contract tests");
    }
    return value;
  }

  function post(
    path: string,
    token: string,
    body: Record<string, unknown>,
    idempotencyKey = `lifecycle-contract-${suffix}-${++keyCounter}`,
  ): Promise<Response> {
    return Promise.resolve(
      tenantLifecycleRouter.request(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${token}`,
          [IDEMPOTENCY_HEADER]: idempotencyKey,
          Origin: controlPlaneOrigin(),
          "X-Forwarded-For": "198.51.100.12",
        },
        body: JSON.stringify(body),
      }),
    );
  }
  async function problem(response: Response): Promise<ProblemBody> {
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    return (await response.json()) as ProblemBody;
  }

  beforeAll(async () => {
    tenantLifecycleRouter.onError(globalErrorHandler);
    platformPrisma = createPlatformTestClient();
    ownerPrisma = createPlatformOwnerTestClient();
    await clearRateLimitStore("rl:admin:tenant-lifecycle");
    operatorToken = await createOperator([PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code]);
    readerToken = await createOperator([PLATFORM_CAPABILITIES.TENANTS_READ.code]);
  });

  afterAll(async () => {
    await ownerPrisma.auditEvent.deleteMany({ where: { OR: [{ actorOperatorId: { in: operatorIds } }, { organizationId: { in: orgIds } }] } });
    await ownerPrisma.lifecycleEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
    for (const organizationId of orgIds) {
      await ownerPrisma.outboxEvent.deleteMany({ where: { eventType: { startsWith: "platform.tenant." }, payload: { path: ["organizationId"], equals: organizationId } } });
    }
    await ownerPrisma.operatorCapability.deleteMany({ where: { operatorId: { in: operatorIds } } });
    await ownerPrisma.platformOperator.deleteMany({ where: { id: { in: operatorIds } } });
    await ownerPrisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    await platformPrisma.$disconnect(); await ownerPrisma.$disconnect();
  });

  it("keeps the success envelope, result shape and audit row", async () => {
    const tenant = await createTenant();
    const response = await post(`/tenants/${tenant.id}/suspend`, operatorToken, { reason: "Contract check of suspend", expectedStatus: "ACTIVE" });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; requestId: string; timestamp: string; data: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(body.requestId.length).toBeGreaterThan(0);
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    expect(Object.keys(body.data).sort()).toEqual(["fromStatus", "lifecycleEventId", "occurredAt", "toStatus"]);
    expect(body.data).toMatchObject({ fromStatus: "ACTIVE", toStatus: "SUSPENDED" });
    expect(new Date(String(body.data.occurredAt)).toISOString()).toBe(body.data.occurredAt);

    const audit = await ownerPrisma.auditEvent.findFirst({
      where: { organizationId: tenant.id, action: PLATFORM_AUDIT_ACTIONS.TENANT_STATUS_CHANGED },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit?.after).toMatchObject({ status: "SUSPENDED" });
  });

  it("keeps the 409 conflict contract", async () => {
    const tenant = await createTenant();
    const response = await post(`/tenants/${tenant.id}/suspend`, operatorToken, { reason: "Stale operator view", expectedStatus: "TRIAL" });
    expect(response.status).toBe(409);
    expect(await problem(response)).toMatchObject({ status: 409, code: PLATFORM_ERROR_CODE.LIFECYCLE_CONFLICT, type: "/errors/lifecycle-conflict" });
  });

  it("keeps the 403 capability-denial contract", async () => {
    const tenant = await createTenant();
    const response = await post(`/tenants/${tenant.id}/suspend`, readerToken, { reason: "Reader may not mutate", expectedStatus: "ACTIVE" });
    expect(response.status).toBe(403);
    expect(await problem(response)).toMatchObject({ status: 403, code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED, type: "/errors/capability-denied" });
  });

  it("keeps the restore contract", async () => {
    const tenant = await createTenant();
    await post(`/tenants/${tenant.id}/suspend`, operatorToken, { reason: "Restore contract setup", expectedStatus: "ACTIVE" });
    const response = await post(`/tenants/${tenant.id}/restore`, operatorToken, { reason: "Review cleared the account", expectedStatus: "SUSPENDED" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: LifecycleData };
    expect(body.data).toMatchObject({ fromStatus: "SUSPENDED", toStatus: "ACTIVE" });
  });

  it("keeps the archive contract", async () => {
    const tenant = await createTenant();
    const response = await post(`/tenants/${tenant.id}/archive`, operatorToken, { reason: "Offboarding after contract end", expectedStatus: "ACTIVE", confirmSlug: tenant.slug });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: LifecycleData };
    expect(body.data).toMatchObject({ fromStatus: "ACTIVE", toStatus: "ARCHIVED" });
  });

  it("keeps the slug-mismatch contract", async () => {
    const tenant = await createTenant();
    const response = await post(`/tenants/${tenant.id}/archive`, operatorToken, { reason: "Offboarding after contract end", expectedStatus: "ACTIVE", confirmSlug: "not-this-tenant" });
    expect(response.status).toBe(422);
    expect(await problem(response)).toMatchObject({ status: 422, code: PLATFORM_ERROR_CODE.SLUG_MISMATCH });
  });

  it("keeps the invalid-transition contract", async () => {
    const tenant = await createTenant();
    const response = await post(`/tenants/${tenant.id}/restore`, operatorToken, { reason: "No suspension exists", expectedStatus: "ACTIVE" });
    expect(response.status).toBe(422);
    expect(await problem(response)).toMatchObject({ status: 422, code: PLATFORM_ERROR_CODE.INVALID_TRANSITION });
  });

  it("replays an identical request under the same key", async () => {
    const tenant = await createTenant();
    const key = `lifecycle-contract-replay-${suffix}`;
    const body = { reason: "Replayed suspension request", expectedStatus: "ACTIVE" };
    const first = await post(`/tenants/${tenant.id}/suspend`, operatorToken, body, key);
    const firstBody = (await first.json()) as { data: LifecycleData };
    const replay = await post(`/tenants/${tenant.id}/suspend`, operatorToken, body, key);
    expect(replay.headers.get("x-idempotent-replay")).toBe("true");
    const replayBody = (await replay.json()) as { data: LifecycleData };
    expect(replayBody.data.lifecycleEventId).toBe(firstBody.data.lifecycleEventId);
  });
});
