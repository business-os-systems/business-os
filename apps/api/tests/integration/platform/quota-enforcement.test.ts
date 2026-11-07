import { afterAll, beforeAll, expect, it } from "vitest";
import { Prisma, createPlatformPrismaClient } from "@suite/db";
import { PLATFORM_CAPABILITIES, QUOTA_KEYS } from "@suite/core";
import { QuotaExceededError } from "@suite/core/errors";
import {
  assertQuotaAvailable,
  assertTenantWriteQuotaAvailable,
  readQuotaAvailability,
} from "@suite/db";
import {
  PageService,
  SiteService,
} from "@suite/website-builder/services";
import { platformQuotasRouter } from "../../../src/routes/admin/quotas.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createOperatorFixture,
  platformOperatorTestsEnabled,
  sendOperatorRequest,
  type OperatorFixture,
} from "../../helpers/platform-operators.js";

loadPlatformTestEnv();

const enabled = platformOperatorTestsEnabled();
const TENANT_URL = process.env.TENANT_DATABASE_URL;

let fixture: OperatorFixture;
let managerToken: string;
let operatorId: string;
const organizationIds: string[] = [];

async function createTenant(label: string): Promise<string> {
  const organization = await fixture.ownerPrisma.organization.create({
    data: {
      name: `Enforcement ${label} ${fixture.suffix}`,
      slug: `enforcement-${label}-${fixture.suffix}`,
    },
  });
  organizationIds.push(organization.id);
  return organization.id;
}

async function setQuota(
  organizationId: string,
  resourceKey: string,
  limitValue: bigint,
  isEnforced = true
): Promise<void> {
  await fixture.ownerPrisma.quota.create({
    data: {
      organizationId,
      resourceKey,
      limitValue,
      isEnforced,
      updatedBy: operatorId,
    },
  });
}

async function createBranch(organizationId: string, code: string): Promise<void> {
  await fixture.ownerPrisma.branch.create({
    data: {
      organizationId,
      name: `Branch ${code}`,
      code,
      type: "HOSPITALITY_LODGING",
    },
  });
}

/**
 * Gate-level integration: the gate and a write share one transaction. The
 * route -> service wiring is covered separately by
 * apps/dashboard/tests/branches-settings-api.test.ts.
 */
async function createBranchThroughGate(
  organizationId: string,
  code: string
): Promise<void> {
  await fixture.ownerPrisma.$transaction(async (tx) => {
    await assertTenantWriteQuotaAvailable(tx, {
      organizationId,
      resourceKey: QUOTA_KEYS.BRANCHES,
    });
    await tx.branch.create({
      data: {
        organizationId,
        name: `Branch ${code}`,
        code,
        type: "HOSPITALITY_LODGING",
      },
    });
  });
}

async function readQuota(
  organizationId: string,
  resourceKey: string
): Promise<Awaited<ReturnType<typeof readQuotaAvailability>>> {
  return fixture.ownerPrisma.$transaction((tx) =>
    readQuotaAvailability(tx, { organizationId, resourceKey })
  );
}

beforeAll(async () => {
  if (!enabled) return;
  platformQuotasRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture("quota-enforcement");
  const manager = await fixture.createOperator([
    PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code,
  ]);
  managerToken = manager.token;
  operatorId = manager.id;
  await clearRateLimitStore();
});

afterAll(async () => {
  if (!enabled) return;
  if (organizationIds.length > 0) {
    await fixture.ownerPrisma.quota.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await fixture.ownerPrisma.branch.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await fixture.ownerPrisma.cmsPage.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await fixture.ownerPrisma.cmsDomain.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await fixture.ownerPrisma.cmsSite.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await fixture.ownerPrisma.auditEvent.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await fixture.ownerPrisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
  }
  await fixture.cleanup();
});

it.skipIf(!enabled)("hard-blocks a branch at the configured limit", async () => {
  const organizationId = await createTenant("hard-block");
  await setQuota(organizationId, QUOTA_KEYS.BRANCHES, 1n);
  await createBranch(organizationId, "HB-1");

  await expect(
    createBranchThroughGate(organizationId, "HB-2")
  ).rejects.toBeInstanceOf(QuotaExceededError);

  const branches = await fixture.ownerPrisma.branch.count({
    where: { organizationId },
  });
  expect(branches).toBe(1);
});

it.skipIf(!enabled)("keeps content when a limit is lowered and blocks new rows", async () => {
  const organizationId = await createTenant("lowered");
  await createBranch(organizationId, "LOW-1");
  await createBranch(organizationId, "LOW-2");
  await createBranch(organizationId, "LOW-3");
  await setQuota(organizationId, QUOTA_KEYS.BRANCHES, 1n);

  const remaining = await fixture.ownerPrisma.branch.count({
    where: { organizationId },
  });
  expect(remaining).toBe(3);

  await expect(
    createBranchThroughGate(organizationId, "LOW-4")
  ).rejects.toBeInstanceOf(QuotaExceededError);
  expect(
    await fixture.ownerPrisma.branch.count({ where: { organizationId } })
  ).toBe(3);

  const availability = await readQuota(organizationId, QUOTA_KEYS.BRANCHES);
  expect(availability).toMatchObject({
    allowed: false,
    currentValue: 3n,
    limitValue: 1n,
    isOverLimit: true,
    isMeasurable: true,
  });
});

it.skipIf(!enabled)("surfaces an over-limit tenant on the quota read", async () => {
  const organizationId = await createTenant("over-limit");
  await createBranch(organizationId, "OVR-1");
  await createBranch(organizationId, "OVR-2");
  await setQuota(organizationId, QUOTA_KEYS.BRANCHES, 1n);

  const response = await sendOperatorRequest(platformQuotasRouter, {
    method: "GET",
    path: `/tenants/${organizationId}/quotas`,
    token: managerToken,
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    data: { items: { resourceKey: string; isOverLimit: boolean }[] };
  };
  expect(
    body.data.items.find((item) => item.resourceKey === QUOTA_KEYS.BRANCHES)
      ?.isOverLimit
  ).toBe(true);
});

it.skipIf(!enabled)("hard-blocks CMS page creation at the page limit", async () => {
  const organizationId = await createTenant("pages");
  const site = await fixture.ownerPrisma.cmsSite.create({
    data: {
      organizationId,
      title: "Quota Site",
      slug: `quota-site-${fixture.suffix}`,
    },
  });
  await setQuota(organizationId, QUOTA_KEYS.PAGES, 0n);

  await expect(
    new PageService().createPage({
      organizationId,
      siteId: site.id,
      title: "Blocked Page",
      slug: "/blocked",
    })
  ).rejects.toBeInstanceOf(QuotaExceededError);

  expect(
    await fixture.ownerPrisma.cmsPage.count({ where: { organizationId } })
  ).toBe(0);
});

it.skipIf(!enabled)("does not charge a custom-domain seat for the auto-provisioned site subdomain", async () => {
  const organizationId = await createTenant("subdomain");
  await setQuota(organizationId, QUOTA_KEYS.CUSTOM_DOMAINS, 1n);

  const result = await new SiteService().createSite({
    organizationId,
    title: "Subdomain Site",
    slug: `subdomain-site-${fixture.suffix}`,
  });
  expect(result.site.status).toBe("DRAFT");

  const domains = await fixture.ownerPrisma.cmsDomain.findMany({
    where: { organizationId },
  });
  expect(domains).toHaveLength(1);
  expect(domains[0]?.isSubdomain).toBe(true);

  const availability = await readQuota(organizationId, QUOTA_KEYS.CUSTOM_DOMAINS);
  expect(availability).toMatchObject({
    allowed: true,
    currentValue: 0n,
    isOverLimit: false,
  });
});

it.skipIf(!enabled)("never enforces the unmeasurable storage resource (FR-091)", async () => {
  const organizationId = await createTenant("storage");
  await setQuota(organizationId, QUOTA_KEYS.STORAGE, 0n, false);

  const availability = await readQuota(organizationId, QUOTA_KEYS.STORAGE);
  expect(availability).toMatchObject({
    allowed: true,
    currentValue: null,
    isMeasurable: false,
    isEnforced: false,
  });

  await expect(
    fixture.ownerPrisma.$transaction((tx) =>
      assertQuotaAvailable(tx, {
        organizationId,
        resourceKey: QUOTA_KEYS.STORAGE,
      })
    )
  ).resolves.toBeUndefined();
});

it.skipIf(!enabled || TENANT_URL === undefined)(
  "lets the tenant identity call the gate but not read platform.quotas",
  async () => {
    if (TENANT_URL === undefined) {
      throw new Error("TENANT_DATABASE_URL must be set");
    }
    const organizationId = await createTenant("tenant-identity");
    await setQuota(organizationId, QUOTA_KEYS.BRANCHES, 5n);

    const tenantPrisma = createPlatformPrismaClient({
      databaseUrl: TENANT_URL,
    });

    try {
      await expect(
        tenantPrisma.$transaction((tx) =>
          assertQuotaAvailable(tx, {
            organizationId,
            resourceKey: QUOTA_KEYS.BRANCHES,
          })
        )
      ).resolves.toBeUndefined();

      await expect(
        tenantPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.quotas LIMIT 1`
        )
      ).rejects.toThrow(/42501|permission denied/);
    } finally {
      await tenantPrisma.$disconnect();
    }
  }
);
