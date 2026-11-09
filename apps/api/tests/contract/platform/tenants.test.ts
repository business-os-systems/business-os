import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@suite/db";
import { OrgStatus } from "@suite/db";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
  QUOTA_KEYS,
} from "@suite/core";
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

loadPlatformTestEnv();

const secret = process.env.CONTROL_SESSION_SECRET;
const enabled = platformIntegrationTestsEnabled() && Boolean(secret);

const ORG_STATUSES: readonly string[] = Object.values(OrgStatus);

const TENANT_ITEM_KEYS = [
  "branchCount",
  "createdAt",
  "id",
  "installedAppIds",
  "memberCount",
  "name",
  "slug",
  "status",
];

const PROFILE_KEYS = ["createdAt", "id", "name", "slug", "status"];
const COUNT_KEYS = ["branches", "members"];
const QUOTA_RECORD_KEYS = [
  "asOf",
  "currentValue",
  "isEnforced",
  "isMeasurable",
  "isOverLimit",
  "limitValue",
  "resourceKey",
  "unit",
  "updatedAt",
];

interface TenantItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  branchCount: number;
  memberCount: number;
  installedAppIds: string[];
}

interface ListBody {
  success: boolean;
  requestId: string;
  timestamp: string;
  data: { items: TenantItem[]; total: number; nextCursor: string | null };
}

interface QuotaItem {
  resourceKey: string;
  limitValue: string;
  unit: "count" | "bytes" | null;
  currentValue: string | null;
  isMeasurable: boolean;
  asOf: string;
  isEnforced: boolean;
  updatedAt: string;
}

interface RecordBody {
  success: boolean;
  data: {
    profile: {
      id: string;
      name: string;
      slug: string;
      status: string;
      createdAt: string;
    };
    counts: { branches: number; members: number };
    apps: string[];
    quotas: QuotaItem[];
    lifecycle: unknown[];
    recentAudit: unknown[];
  };
}

interface ProblemBody {
  type: string;
  status: number;
  code: string;
}

function isIsoTimestamp(value: string): boolean {
  return new Date(value).toISOString() === value;
}

describe.skipIf(!enabled)("Platform tenant contract", () => {
  const suffix = Date.now().toString(36);
  const createdOperatorIds: string[] = [];
  const createdOrgIds: string[] = [];
  const tenantName = `Contract Tenant ${suffix}`;
  const tenantSlug = `contract-tenant-${suffix}`;
  let platformPrisma: PrismaClient;
  let ownerPrisma: PrismaClient;
  let readerToken: string;
  let tenantId: string;

  async function createReader(): Promise<{ id: string; token: string }> {
    const operator = await platformPrisma.platformOperator.create({
      data: {
        email: `platform-contract-${suffix}@example.com`,
        displayName: "Contract Reader",
        status: "ACTIVE",
        mfaEnrolled: true,
      },
    });
    createdOperatorIds.push(operator.id);

    await platformPrisma.operatorCapability.create({
      data: {
        operatorId: operator.id,
        capability: PLATFORM_CAPABILITIES.TENANTS_READ.code,
      },
    });

    const issued = await issueControlSession({
      prisma: platformPrisma,
      secret: secret ?? "",
      operatorId: operator.id,
    });
    return { id: operator.id, token: issued.token };
  }

  function authedGet(path: string): Promise<Response> {
    const origin = process.env.CONTROL_PLANE_ORIGIN;
    if (origin === undefined || origin.trim() === "") {
      throw new Error("CONTROL_PLANE_ORIGIN must be set for tenant contract tests");
    }
    return Promise.resolve(
      tenantAdminRouter.request(path, {
        method: "GET",
        headers: {
          Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${readerToken}`,
          Origin: origin,
        },
      }),
    );
  }

  function findItem(items: readonly TenantItem[]): TenantItem {
    const item = items.find((entry) => entry.id === tenantId);
    if (item === undefined) {
      throw new Error(
        `Fixture tenant ${tenantId} missing from the tenant list`,
      );
    }
    return item;
  }

  beforeAll(async () => {
    tenantAdminRouter.onError(globalErrorHandler);
    platformPrisma = createPlatformTestClient();
    ownerPrisma = createPlatformOwnerTestClient();

    const reader = await createReader();
    readerToken = reader.token;

    const organization = await ownerPrisma.organization.create({
      data: { name: tenantName, slug: tenantSlug },
    });
    tenantId = organization.id;
    createdOrgIds.push(tenantId);

    await ownerPrisma.quota.create({
      data: {
        organizationId: tenantId,
        resourceKey: QUOTA_KEYS.BRANCHES,
        limitValue: 5n,
        updatedBy: reader.id,
      },
    });
  });

  afterAll(async () => {
    // Audit rows and quotas reference the operators and the tenant with
    // ON DELETE RESTRICT, so they are removed first (D-027).
    await ownerPrisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actorOperatorId: { in: createdOperatorIds } },
          { organizationId: { in: createdOrgIds } },
        ],
      },
    });
    await ownerPrisma.quota.deleteMany({
      where: { organizationId: { in: createdOrgIds } },
    });
    await ownerPrisma.userOrganization.deleteMany({
      where: { organizationId: { in: createdOrgIds } },
    });
    await ownerPrisma.operatorCapability.deleteMany({
      where: { operatorId: { in: createdOperatorIds } },
    });
    await ownerPrisma.platformOperator.deleteMany({
      where: { id: { in: createdOperatorIds } },
    });
    await ownerPrisma.organization.deleteMany({
      where: { id: { in: createdOrgIds } },
    });
    await platformPrisma.$disconnect();
    await ownerPrisma.$disconnect();
  });

  it("keeps the list envelope contract", async () => {
    const response = await authedGet("/tenants?limit=100");

    expect(response.status).toBe(200);
    const body = (await response.json()) as ListBody;
    expect(body.success).toBe(true);
    expect(typeof body.requestId).toBe("string");
    expect(body.requestId.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(typeof body.data.total).toBe("number");
    expect(Number.isInteger(body.data.total)).toBe(true);
    expect(
      body.data.nextCursor === null || typeof body.data.nextCursor === "string",
    ).toBe(true);
  });

  it("keeps the list item contract without tenant personal data", async () => {
    const response = await authedGet(
      `/tenants?q=${encodeURIComponent(tenantSlug)}`,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ListBody;
    const item = findItem(body.data.items);

    expect(Object.keys(item).sort()).toEqual(TENANT_ITEM_KEYS);
    expect(typeof item.id).toBe("string");
    expect(typeof item.name).toBe("string");
    expect(typeof item.slug).toBe("string");
    expect(ORG_STATUSES).toContain(item.status);
    expect(isIsoTimestamp(item.createdAt)).toBe(true);
    expect(Number.isInteger(item.branchCount)).toBe(true);
    expect(item.branchCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(item.memberCount)).toBe(true);
    expect(item.memberCount).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(item.installedAppIds)).toBe(true);
    const installedAppIdsAreStrings = item.installedAppIds.every(
      (appId) => typeof appId === "string",
    );
    expect(installedAppIdsAreStrings).toBe(true);
    expect(item).not.toHaveProperty("email");
    expect(item).not.toHaveProperty("owner");
  });

  it("keeps the record envelope contract", async () => {
    const response = await authedGet(`/tenants/${tenantId}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as RecordBody;

    expect(Object.keys(body.data.profile).sort()).toEqual(PROFILE_KEYS);
    expect(body.data.profile.id).toBe(tenantId);
    expect(body.data.profile.name).toBe(tenantName);
    expect(body.data.profile.slug).toBe(tenantSlug);
    expect(ORG_STATUSES).toContain(body.data.profile.status);
    expect(isIsoTimestamp(body.data.profile.createdAt)).toBe(true);

    expect(Object.keys(body.data.counts).sort()).toEqual(COUNT_KEYS);
    expect(body.data.counts).toEqual({ branches: 0, members: 0 });

    expect(Array.isArray(body.data.apps)).toBe(true);
    const appIdsAreStrings = body.data.apps.every(
      (appId) => typeof appId === "string",
    );
    expect(appIdsAreStrings).toBe(true);

    expect(body.data.quotas).toHaveLength(1);
    const quota = body.data.quotas[0];
    if (quota === undefined) {
      throw new Error("Fixture quota missing from the tenant record");
    }
    expect(Object.keys(quota).sort()).toEqual(QUOTA_RECORD_KEYS);
    expect(quota.resourceKey).toBe(QUOTA_KEYS.BRANCHES);
    expect(typeof quota.limitValue).toBe("string");
    expect(typeof quota.isEnforced).toBe("boolean");
    expect(quota.unit).toBe("count");
    expect(quota.currentValue).toBe("0");
    expect(quota.isMeasurable).toBe(true);
    expect(isIsoTimestamp(quota.asOf)).toBe(true);
    expect(isIsoTimestamp(quota.updatedAt)).toBe(true);

    expect(Array.isArray(body.data.lifecycle)).toBe(true);
    expect(Array.isArray(body.data.recentAudit)).toBe(true);
  });

  it("keeps the problem details contract for an unknown tenant", async () => {
    const response = await authedGet(`/tenants/tenant_missing_${suffix}`);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    const body = (await response.json()) as ProblemBody;
    expect(body.status).toBe(404);
    expect(body.code).toBe(PLATFORM_ERROR_CODE.TENANT_NOT_FOUND);
    expect(body.type).toMatch(/^\/errors\//);
  });
});
