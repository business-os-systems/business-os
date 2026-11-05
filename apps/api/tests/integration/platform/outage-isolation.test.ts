import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type { PrismaClient } from "@suite/db";
import { verifySessionToken } from "@suite/auth";
import { authRouter } from "../../../src/routes/auth.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { getPlatformPrismaClient } from "../../../src/lib/platform-db.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import { createTestSessionToken } from "../../helpers/auth.js";
import {
  createPlatformOwnerTestClient,
  platformIntegrationTestsEnabled,
} from "../../helpers/platform-db.js";

loadPlatformTestEnv();

const enabled = platformIntegrationTestsEnabled();

/**
 * The control-plane datastore is deliberately pointed at a closed port. If any
 * tenant sign-in path reached for the platform plane, these assertions would
 * fail with a connection error instead of serving the workspace.
 */
const UNREACHABLE_PLATFORM_URL =
  "postgresql://app_platform:unreachable@127.0.0.1:1/business_os_dev";

const tenantListSchema = z.object({
  tenants: z.array(
    z.object({
      organizationId: z.string(),
      name: z.string(),
      slug: z.string(),
      role: z.string(),
      logoUrl: z.string().nullable(),
    })
  ),
});

const suffix = Date.now().toString(36);
const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];
const previousPlatformUrl = process.env.PLATFORM_DATABASE_URL;
let ownerPrisma: PrismaClient;
let tenantToken = "";
let tenantId = "";

async function createTenantFixture(): Promise<void> {
  const organization = await ownerPrisma.organization.create({
    data: {
      name: `Outage Isolation ${suffix}`,
      slug: `outage-isolation-${suffix}`,
    },
  });
  tenantId = organization.id;
  createdOrgIds.push(tenantId);

  const user = await ownerPrisma.user.create({
    data: {
      email: `outage-${suffix}@example.com`,
      name: "Outage Isolation",
      emailVerified: true,
    },
  });
  createdUserIds.push(user.id);

  await ownerPrisma.userOrganization.create({
    data: { userId: user.id, organizationId: tenantId, status: "ACTIVE" },
  });

  // Issued the way sign-in issues it: the workspaces the dashboard redirects into.
  tenantToken = await createTestSessionToken({
    userId: user.id,
    email: user.email,
    userName: user.name,
    organizationId: tenantId,
    organizationName: organization.name,
  });
}

beforeAll(async () => {
  if (!enabled) {
    return;
  }
  authRouter.onError(globalErrorHandler);
  ownerPrisma = createPlatformOwnerTestClient();
  await createTenantFixture();
  process.env.PLATFORM_DATABASE_URL = UNREACHABLE_PLATFORM_URL;
});

afterAll(async () => {
  if (!enabled) {
    return;
  }
  if (previousPlatformUrl === undefined) {
    delete process.env.PLATFORM_DATABASE_URL;
  } else {
    process.env.PLATFORM_DATABASE_URL = previousPlatformUrl;
  }
  await ownerPrisma.userOrganization.deleteMany({
    where: { organizationId: { in: createdOrgIds } },
  });
  await ownerPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await ownerPrisma.organization.deleteMany({
    where: { id: { in: createdOrgIds } },
  });
  await ownerPrisma.$disconnect();
});

describe.skipIf(!enabled)("Simulated control-plane outage", () => {
  it("cannot reach the control-plane datastore", async () => {
    const platformPrisma = getPlatformPrismaClient();

    await expect(platformPrisma.$queryRaw`SELECT 1`).rejects.toThrow();
  });
});

describe.skipIf(!enabled)("Tenant sign-in during the outage", () => {
  it("still issues and verifies a tenant session", async () => {
    expect(tenantToken.length).toBeGreaterThan(0);
    await expect(verifySessionToken(tenantToken)).resolves.toBe(true);
  });

  it("still serves the workspace list the sign-in redirects into", async () => {
    const response = await authRouter.request("/tenants", {
      method: "GET",
      headers: { Authorization: `Bearer ${tenantToken}` },
    });

    expect(response.status).toBe(200);
    const body = tenantListSchema.parse(await response.json());
    const tenant = body.tenants.find((entry) => entry.organizationId === tenantId);
    if (tenant === undefined) {
      throw new Error("The tenant workspace is missing from the sign-in list");
    }
    expect(tenant.slug).toBe(`outage-isolation-${suffix}`);
    expect(tenant.role).not.toBe("");
  });
});


