import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@suite/db";
import type { Redis } from "@suite/redis";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
  STEP_UP_TOKEN_HEADER,
} from "@suite/core";
import {
  CONTROL_SESSION_COOKIE_NAME,
  issueControlSession,
  PLATFORM_AUDIT_ACTIONS,
} from "@suite/auth/platform";
import { tenantLifecycleRouter } from "../../../src/routes/admin/lifecycle.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import { createTenantAccessGuard } from "../../../src/middleware/tenant-access.js";
import { TENANT_ACCESS_CACHE_TTL_SECONDS } from "../../../src/services/admin/tenant-access.service.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import { issueStepUpTokenForSessionToken } from "../../helpers/platform-operators.js";
import {
  createPlatformOwnerTestClient,
  createPlatformTestClient,
  platformIntegrationTestsEnabled,
} from "../../helpers/platform-db.js";

loadPlatformTestEnv();

const secret = process.env.CONTROL_SESSION_SECRET;
const enabled = platformIntegrationTestsEnabled() && Boolean(secret);

interface LifecycleBody {
  data: {
    lifecycleEventId: string;
    fromStatus: string;
    toStatus: string;
    occurredAt: string;
  };
}

interface ProblemBody {
  code: string;
  type: string;
}

describe.skipIf(!enabled)("Platform tenant lifecycle routes", () => {
  const suffix = Date.now().toString(36);
  const createdOperatorIds: string[] = [];
  const createdOrgIds: string[] = [];
  let platformPrisma: PrismaClient;
  let ownerPrisma: PrismaClient;
  let operatorId: string;
  let operatorToken: string;
  let limitedToken: string;
  let keyCounter = 0;

  async function createOperator(
    capabilities: readonly string[]
  ): Promise<{ id: string; token: string }> {
    const operator = await platformPrisma.platformOperator.create({
      data: {
        email: `lifecycle-${suffix}-${createdOperatorIds.length}@example.com`,
        displayName: "Lifecycle Operator",
        status: "ACTIVE",
        mfaEnrolled: true,
      },
    });
    createdOperatorIds.push(operator.id);

    for (const capability of capabilities) {
      await platformPrisma.operatorCapability.create({
        data: { operatorId: operator.id, capability },
      });
    }

    const issued = await issueControlSession({
      prisma: platformPrisma,
      secret: secret ?? "",
      operatorId: operator.id,
    });
    return { id: operator.id, token: issued.token };
  }

  async function createTenant(
    status: "ACTIVE" | "TRIAL" | "SUSPENDED" | "ARCHIVED"
  ): Promise<{ id: string; slug: string }> {
    const slug = `lifecycle-${suffix}-${createdOrgIds.length}`;
    const organization = await ownerPrisma.organization.create({
      data: { name: `Lifecycle Tenant ${slug}`, slug, status },
    });
    createdOrgIds.push(organization.id);
    return { id: organization.id, slug };
  }

  function createGuardedApp(organizationId: string) {
    const store = new Map<string, string>();
    const ttlSeconds: number[] = [];
    const redis = {
      get: async (key: string) => store.get(key) ?? null,
      set: async (key: string, value: string, _mode: string, ttl: number) => {
        store.set(key, value); ttlSeconds.push(ttl); return "OK";
      },
      del: async (key: string) => (store.delete(key) ? 1 : 0),
    } as unknown as Redis;
    const app = new Hono<{ Variables: { organizationId: string } }>();
    app.use("*", async (c, next) => { c.set("organizationId", organizationId); await next(); });
    app.use("*", createTenantAccessGuard({ prisma: platformPrisma, redis }));
    app.get("/data", (c) => c.text("ok"));
    app.onError(globalErrorHandler);
    return { app, ttlSeconds, clear: () => store.clear() };
  }

  function requireLifecycleOrigin(): string {
    const origin = process.env.CONTROL_PLANE_ORIGIN;
    if (origin === undefined || origin.trim() === "") {
      throw new Error("CONTROL_PLANE_ORIGIN must be set for lifecycle tests");
    }
    return origin;
  }

  async function post(
    path: string,
    token: string,
    body: Record<string, unknown>,
    idempotencyKey = `lifecycle-${suffix}-${++keyCounter}`
  ): Promise<Response> {
    const stepUpToken = await issueStepUpTokenForSessionToken(token);
    return tenantLifecycleRouter.request(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${token}`,
        "Idempotency-Key": idempotencyKey,
        Origin: requireLifecycleOrigin(),
        "X-Forwarded-For": "198.51.100.11",
        ...(stepUpToken === null
          ? {}
          : { [STEP_UP_TOKEN_HEADER]: stepUpToken }),
      },
      body: JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    tenantLifecycleRouter.onError(globalErrorHandler);
    platformPrisma = createPlatformTestClient();
    ownerPrisma = createPlatformOwnerTestClient();
    await clearRateLimitStore("rl:admin:tenant-lifecycle");

    const operator = await createOperator([
      PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code,
    ]);
    operatorId = operator.id;
    operatorToken = operator.token;

    const limited = await createOperator([
      PLATFORM_CAPABILITIES.TENANTS_READ.code,
    ]);
    limitedToken = limited.token;
  });

  afterAll(async () => {
    if (createdOperatorIds.length > 0) {
      await ownerPrisma.auditEvent.deleteMany({
        where: { actorOperatorId: { in: createdOperatorIds } },
      });
    }
    if (createdOrgIds.length > 0) {
      await ownerPrisma.lifecycleEvent.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      // Scoped to this suite's tenants: other suites emit lifecycle events too
      // and the outbox is shared state.
      for (const organizationId of createdOrgIds) {
        await ownerPrisma.outboxEvent.deleteMany({
          where: {
            eventType: { startsWith: "platform.tenant." },
            payload: { path: ["organizationId"], equals: organizationId },
          },
        });
      }
      await ownerPrisma.auditEvent.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await ownerPrisma.organization.deleteMany({
        where: { id: { in: createdOrgIds } },
      });
    }
    if (createdOperatorIds.length > 0) {
      await ownerPrisma.operatorCapability.deleteMany({
        where: { operatorId: { in: createdOperatorIds } },
      });
      await ownerPrisma.platformOperator.deleteMany({
        where: { id: { in: createdOperatorIds } },
      });
    }
    await platformPrisma.$disconnect();
    await ownerPrisma.$disconnect();
  });

  it("suspends an active tenant, records the lifecycle event and audits it", async () => {
    const tenant = await createTenant("ACTIVE");
    const response = await post(`/tenants/${tenant.id}/suspend`, operatorToken, {
      reason: "Non-payment after two reminders",
      expectedStatus: "ACTIVE",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as LifecycleBody;
    expect(body.data.fromStatus).toBe("ACTIVE");
    expect(body.data.toStatus).toBe("SUSPENDED");
    expect(body.data.lifecycleEventId.length).toBeGreaterThan(0);

    const persisted = await ownerPrisma.organization.findUnique({
      where: { id: tenant.id },
      select: { status: true },
    });
    expect(persisted?.status).toBe("SUSPENDED");

    const event = await ownerPrisma.lifecycleEvent.findFirst({
      where: { organizationId: tenant.id },
      orderBy: { occurredAt: "desc" },
    });
    expect(event?.toStatus).toBe("SUSPENDED");
    expect(event?.reason).toBe("Non-payment after two reminders");
    expect(event?.actorOperatorId).toBe(operatorId);

    const audit = await ownerPrisma.auditEvent.findFirst({
      where: {
        organizationId: tenant.id,
        action: PLATFORM_AUDIT_ACTIONS.TENANT_STATUS_CHANGED,
      },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit?.after).toMatchObject({ status: "SUSPENDED" });

    const outbox = await ownerPrisma.outboxEvent.findFirst({
      where: {
        eventType: "platform.tenant.suspended",
        payload: { path: ["organizationId"], equals: tenant.id },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(outbox).not.toBeNull();
    // A developer's API dev server may share this database and poll the
    // outbox, so the enqueue contract is the row and its payload, not the
    // transient status a live dispatcher may already have advanced.
    expect(["PENDING", "PROCESSING", "DONE"]).toContain(outbox?.status);
    expect(outbox?.payload).toMatchObject({
      id: body.data.lifecycleEventId,
      type: "platform.tenant.suspended",
      version: 1,
      organizationId: tenant.id,
      data: { fromStatus: "ACTIVE", toStatus: "SUSPENDED" },
    });
    expect(JSON.stringify(outbox?.payload)).not.toContain("Non-payment");
  });

  it("refuses a stale expectedStatus with a lifecycle conflict", async () => {
    const tenant = await createTenant("ACTIVE");
    const response = await post(`/tenants/${tenant.id}/suspend`, operatorToken, {
      reason: "Abuse report under review",
      expectedStatus: "TRIAL",
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as ProblemBody;
    expect(body.code).toBe(PLATFORM_ERROR_CODE.LIFECYCLE_CONFLICT);
    expect(body.type).toBe("/errors/lifecycle-conflict");
  });

  it("denies an operator without the lifecycle capability", async () => {
    const tenant = await createTenant("ACTIVE");
    const response = await post(`/tenants/${tenant.id}/suspend`, limitedToken, {
      reason: "Not authorised to do this",
      expectedStatus: "ACTIVE",
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as ProblemBody;
    expect(body.code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
  });

  it("requires an idempotency key on the mutation", async () => {
    const tenant = await createTenant("ACTIVE");
    const response = await tenantLifecycleRouter.request(
      `/tenants/${tenant.id}/suspend`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${operatorToken}`,
          Origin: requireLifecycleOrigin(),
        },
        body: JSON.stringify({
          reason: "Missing idempotency key",
          expectedStatus: "ACTIVE",
        }),
      }
    );

    expect(response.status).toBe(422);
    const body = (await response.json()) as ProblemBody;
    expect(body.code).toBe(PLATFORM_ERROR_CODE.IDEMPOTENCY_KEY_REQUIRED);
  });

  it("replays an identical request from the stored response", async () => {
    const tenant = await createTenant("ACTIVE");
    const key = `lifecycle-replay-${suffix}`;
    const body = {
      reason: "Replayed suspension request",
      expectedStatus: "ACTIVE",
    };

    const first = await post(`/tenants/${tenant.id}/suspend`, operatorToken, body, key);
    const firstBody = (await first.json()) as LifecycleBody;

    const replay = await post(`/tenants/${tenant.id}/suspend`, operatorToken, body, key);
    expect(replay.status).toBe(200);
    expect(replay.headers.get("x-idempotent-replay")).toBe("true");
    const replayBody = (await replay.json()) as LifecycleBody;
    expect(replayBody.data.lifecycleEventId).toBe(firstBody.data.lifecycleEventId);

    const events = await ownerPrisma.lifecycleEvent.count({
      where: { organizationId: tenant.id },
    });
    expect(events).toBe(1);
  });

  it("refuses a restore when the tenant was never suspended", async () => {
    const tenant = await createTenant("ACTIVE");
    const response = await post(`/tenants/${tenant.id}/restore`, operatorToken, {
      reason: "Mistaken restore attempt",
      expectedStatus: "ACTIVE",
    });

    expect(response.status).toBe(422);
    const body = (await response.json()) as ProblemBody;
    expect(body.code).toBe(PLATFORM_ERROR_CODE.INVALID_TRANSITION);
  });

  it("restores a suspended tenant to the status it held before", async () => {
    const tenant = await createTenant("TRIAL");
    await post(`/tenants/${tenant.id}/suspend`, operatorToken, {
      reason: "Trial abuse under review",
      expectedStatus: "TRIAL",
    });

    const response = await post(`/tenants/${tenant.id}/restore`, operatorToken, {
      reason: "Review cleared the account",
      expectedStatus: "SUSPENDED",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as LifecycleBody;
    expect(body.data.fromStatus).toBe("SUSPENDED");
    expect(body.data.toStatus).toBe("TRIAL");

    const outbox = await ownerPrisma.outboxEvent.findFirst({
      where: {
        eventType: "platform.tenant.restored",
        payload: { path: ["organizationId"], equals: tenant.id },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(outbox?.payload).toMatchObject({
      organizationId: tenant.id,
      data: { fromStatus: "SUSPENDED", toStatus: "TRIAL" },
    });

    const audit = await ownerPrisma.auditEvent.findFirst({
      where: {
        organizationId: tenant.id,
        action: PLATFORM_AUDIT_ACTIONS.TENANT_STATUS_CHANGED,
      },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit?.before).toMatchObject({ status: "SUSPENDED" });
    expect(audit?.after).toMatchObject({ status: "TRIAL" });
    expect(audit?.reason).toBe("Review cleared the account");
  });

  it("refuses an archive whose confirmation slug does not match", async () => {
    const tenant = await createTenant("ACTIVE");
    const response = await post(`/tenants/${tenant.id}/archive`, operatorToken, {
      reason: "Offboarding after contract end",
      expectedStatus: "ACTIVE",
      confirmSlug: "not-this-tenant",
    });

    expect(response.status).toBe(422);
    const body = (await response.json()) as ProblemBody;
    expect(body.code).toBe(PLATFORM_ERROR_CODE.SLUG_MISMATCH);
  });

  it("archives a tenant once the slug is retyped", async () => {
    const tenant = await createTenant("ACTIVE");
    const response = await post(`/tenants/${tenant.id}/archive`, operatorToken, {
      reason: "Offboarding after contract end",
      expectedStatus: "ACTIVE",
      confirmSlug: tenant.slug,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as LifecycleBody;
    expect(body.data.toStatus).toBe("ARCHIVED");

    const audit = await ownerPrisma.auditEvent.findFirst({
      where: {
        organizationId: tenant.id,
        action: PLATFORM_AUDIT_ACTIONS.TENANT_STATUS_CHANGED,
      },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit?.after).toMatchObject({ status: "ARCHIVED" });

    const outbox = await ownerPrisma.outboxEvent.findFirst({
      where: {
        eventType: "platform.tenant.archived",
        payload: { path: ["organizationId"], equals: tenant.id },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(outbox?.payload).toMatchObject({
      organizationId: tenant.id,
      data: { fromStatus: "ACTIVE", toStatus: "ARCHIVED" },
    });
  });

  it("denies restore and archive to an operator without the lifecycle capability", async () => {
    const tenant = await createTenant("SUSPENDED");

    const restore = await post(`/tenants/${tenant.id}/restore`, limitedToken, {
      reason: "Not authorised to restore",
      expectedStatus: "SUSPENDED",
    });
    expect(restore.status).toBe(403);
    expect(((await restore.json()) as ProblemBody).code).toBe(
      PLATFORM_ERROR_CODE.CAPABILITY_DENIED
    );

    const archive = await post(`/tenants/${tenant.id}/archive`, limitedToken, {
      reason: "Not authorised to archive",
      expectedStatus: "SUSPENDED",
      confirmSlug: tenant.slug,
    });
    expect(archive.status).toBe(403);
    expect(((await archive.json()) as ProblemBody).code).toBe(
      PLATFORM_ERROR_CODE.CAPABILITY_DENIED
    );
  });

  it("serves an active tenant and caches the status for sixty seconds", async () => {
    const tenant = await createTenant("ACTIVE");
    const guarded = createGuardedApp(tenant.id);

    expect((await guarded.app.request("/data")).status).toBe(200);
    expect(guarded.ttlSeconds).toEqual([TENANT_ACCESS_CACHE_TTL_SECONDS]);
  });

  it("blocks tenant requests after a suspension and allows them after a restore", async () => {
    const tenant = await createTenant("ACTIVE");
    const guarded = createGuardedApp(tenant.id);

    const suspended = await post(`/tenants/${tenant.id}/suspend`, operatorToken, { reason: "Abuse report under review", expectedStatus: "ACTIVE" });
    expect(suspended.status).toBe(200);

    // Production drops this key from the outbox handler; clearing it here
    // simulates the cache miss that the sixty-second expiry is allowed to cause.
    guarded.clear();
    const blocked = await guarded.app.request("/data");
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as ProblemBody).code).toBe(PLATFORM_ERROR_CODE.TENANT_SUSPENDED);

    const restored = await post(`/tenants/${tenant.id}/restore`, operatorToken, { reason: "Review cleared the account", expectedStatus: "SUSPENDED" });
    expect(restored.status).toBe(200);

    guarded.clear();
    expect((await guarded.app.request("/data")).status).toBe(200);
  });

  it("returns TENANT_NOT_FOUND for an unknown tenant", async () => {
    const response = await post(
      "/tenants/tenant_missing_probe/suspend",
      operatorToken,
      { reason: "Probing a missing tenant", expectedStatus: "ACTIVE" }
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as ProblemBody;
    expect(body.code).toBe(PLATFORM_ERROR_CODE.TENANT_NOT_FOUND);
  });
});
