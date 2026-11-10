import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@suite/db";
import { PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE } from "@suite/core";
import {
  CONTROL_SESSION_COOKIE_NAME,
  issueControlSession,
} from "@suite/auth/platform";
import { tenantAdminRouter } from "../../../src/routes/admin/tenants.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createPlatformOwnerTestClient,
  createPlatformTestClient,
  platformIntegrationTestsEnabled,
} from "../../helpers/platform-db.js";
import { platformTestRpId } from "../../helpers/platform-rp.js";

loadPlatformTestEnv();

const secret = process.env.CONTROL_SESSION_SECRET;
const enabled = platformIntegrationTestsEnabled() && Boolean(secret);

describe.skipIf(!enabled)("Platform tenant read routes", () => {
  const suffix = Date.now().toString(36);
  const createdOrgIds: string[] = [];
  const createdOperatorIds: string[] = [];
  let platformPrisma: PrismaClient;
  let ownerPrisma: PrismaClient;
  let readerToken: string;
  let limitedToken: string;

  async function createOperator(capabilities: readonly string[]): Promise<string> {
    const operator = await platformPrisma.platformOperator.create({
      data: {
        email: `tenant-read-${suffix}-${createdOperatorIds.length}@example.com`,
        displayName: "Tenant Reader",
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
      rpID: platformTestRpId(),
      operatorId: operator.id,
    });
    return issued.token;
  }

  async function createTenant(label: string): Promise<{ id: string; name: string }> {
    const name = `Tenant ${label} ${suffix}`;
    const organization = await ownerPrisma.organization.create({
      data: { name, slug: `tenant-${label}-${suffix}` },
    });
    createdOrgIds.push(organization.id);
    return { id: organization.id, name };
  }

  function controlPlaneOrigin(): string {
    const value = process.env.CONTROL_PLANE_ORIGIN;
    if (value === undefined || value.trim() === "") {
      throw new Error("CONTROL_PLANE_ORIGIN must be set for tenant read tests");
    }
    return value;
  }

  function authedGet(path: string, token: string): Promise<Response> {
    return Promise.resolve(
      tenantAdminRouter.request(path, {
        method: "GET",
        headers: {
          Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${token}`,
          Origin: controlPlaneOrigin(),
        },
      })
    );
  }

  beforeAll(async () => {
    tenantAdminRouter.onError(globalErrorHandler);
    platformPrisma = createPlatformTestClient();
    ownerPrisma = createPlatformOwnerTestClient();
    readerToken = await createOperator([PLATFORM_CAPABILITIES.TENANTS_READ.code]);
    limitedToken = await createOperator([PLATFORM_CAPABILITIES.AUDIT_READ.code]);
  });

  afterAll(async () => {
    // app_platform has no DELETE grant; fixtures are removed as the owner.
    // Quotas first: their updatedBy FK restricts deleting the operator.
    if (createdOrgIds.length > 0) {
      await ownerPrisma.quota.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
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
    if (createdOrgIds.length > 0) {
      await ownerPrisma.organization.deleteMany({
        where: { id: { in: createdOrgIds } },
      });
    }
    await platformPrisma.$disconnect();
    await ownerPrisma.$disconnect();
  });

  it("lists tenants with the metadata contract and no personal data", async () => {
    const tenant = await createTenant("list");

    const response = await authedGet("/tenants?limit=100", readerToken);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { items: Array<Record<string, unknown>>; total: number };
    };
    const item = body.data.items.find((entry) => entry.id === tenant.id);
    expect(item).toBeDefined();
    expect(item?.name).toBe(tenant.name);
    expect(Object.keys(item ?? {})).not.toContain("email");
    expect(item).not.toHaveProperty("members");
    expect(body.data.total).toBeGreaterThanOrEqual(1);
  });

  it("filters by search term", async () => {
    const tenant = await createTenant("searchable");

    const response = await authedGet(
      `/tenants?q=${encodeURIComponent("searchable")}`,
      readerToken
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { items: Array<{ id: string }> };
    };
    expect(body.data.items.some((entry) => entry.id === tenant.id)).toBe(true);
  });

  it("pages with a stable cursor", async () => {
    await createTenant("page-a");
    await createTenant("page-b");

    const first = await authedGet("/tenants?limit=1", readerToken);
    const firstBody = (await first.json()) as {
      data: { items: Array<{ id: string }>; nextCursor: string | null };
    };
    expect(firstBody.data.items).toHaveLength(1);
    expect(firstBody.data.nextCursor).not.toBeNull();

    const second = await authedGet(
      `/tenants?limit=1&cursor=${encodeURIComponent(firstBody.data.nextCursor ?? "")}`,
      readerToken
    );
    const secondBody = (await second.json()) as {
      data: { items: Array<{ id: string }> };
    };
    expect(secondBody.data.items[0]?.id).not.toBe(firstBody.data.items[0]?.id);
  });

  it("rejects a malformed cursor", async () => {
    const response = await authedGet("/tenants?cursor=not-a-cursor", readerToken);

    expect(response.status).toBe(422);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe(PLATFORM_ERROR_CODE.VALIDATION_FAILED);
  });

  it("reads one tenant record with counts, apps and audit", async () => {
    const tenant = await createTenant("record");

    const response = await authedGet(`/tenants/${tenant.id}`, readerToken);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        profile: { id: string; name: string };
        counts: { branches: number; members: number; asOf: string };
        apps: string[];
        quotas: unknown[];
        lifecycle: unknown[];
      };
    };
    expect(body.data.profile.id).toBe(tenant.id);
    expect(body.data.profile.name).toBe(tenant.name);
    expect(body.data.counts).toMatchObject({ branches: 0, members: 0 });
    expect(typeof body.data.counts.asOf).toBe("string");
    expect(Array.isArray(body.data.apps)).toBe(true);
  });

  it("includes quota consumption, unit and as-of time in the tenant record", async () => {
    const tenant = await createTenant("quota-usage");
    const operatorId = createdOperatorIds[0];
    if (operatorId === undefined) {
      throw new Error("No operator fixture is available.");
    }

    await ownerPrisma.quota.create({
      data: {
        organizationId: tenant.id,
        resourceKey: "core.branches",
        limitValue: 5n,
        isEnforced: true,
        updatedBy: operatorId,
      },
    });

    const response = await authedGet(`/tenants/${tenant.id}`, readerToken);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { quotas: Record<string, unknown>[] };
    };
    const quota = body.data.quotas.find(
      (item) => item.resourceKey === "core.branches"
    );
    expect(quota).toMatchObject({
      limitValue: "5",
      unit: "count",
      currentValue: "0",
      isMeasurable: true,
      isEnforced: true,
    });
    expect(typeof quota?.asOf).toBe("string");
  });

  it("returns TENANT_NOT_FOUND for an unknown tenant", async () => {
    const response = await authedGet("/tenants/tenant_missing_probe", readerToken);

    expect(response.status).toBe(404);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe(PLATFORM_ERROR_CODE.TENANT_NOT_FOUND);
  });

  it("denies an operator without the tenants capability", async () => {
    const response = await authedGet("/tenants", limitedToken);

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
  });

  it("denies the record route directly without the tenants capability", async () => {
    const response = await authedGet("/tenants/tenant_forbidden_probe", limitedToken);

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
  });
});
