import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@suite/db";
import {
  PII_REASON_HEADER,
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
} from "@suite/core";
import {
  CONTROL_SESSION_COOKIE_NAME,
  issueControlSession,
  PLATFORM_AUDIT_ACTIONS,
} from "@suite/auth/platform";
import { tenantPiiRouter } from "../../../src/routes/admin/tenant-pii.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createPlatformOwnerTestClient,
  createPlatformTestClient,
  platformIntegrationTestsEnabled,
} from "../../helpers/platform-db.js";

loadPlatformTestEnv();

const secret = process.env.CONTROL_SESSION_SECRET;
const enabled = platformIntegrationTestsEnabled() && Boolean(secret);

interface PiiBody {
  data: {
    tenantId: string;
    members: Array<{
      userId: string;
      name: string;
      email: string;
      membershipStatus: string;
    }>;
    checkedAt: string;
  };
}

describe.skipIf(!enabled)("Platform tenant PII route", () => {
  const suffix = Date.now().toString(36);
  const createdOperatorIds: string[] = [];
  const createdOrgIds: string[] = [];
  const activeEmail = `pii-active-${suffix}@example.com`;
  const invitedEmail = `pii-invited-${suffix}@example.com`;
  let platformPrisma: PrismaClient;
  let ownerPrisma: PrismaClient;
  let orgId: string;
  let readerId: string;
  let readerToken: string;
  let limitedToken: string;

  async function createOperator(
    capabilities: readonly string[],
  ): Promise<{ id: string; token: string }> {
    const operator = await platformPrisma.platformOperator.create({
      data: {
        email: `tenant-pii-${suffix}-${createdOperatorIds.length}@example.com`,
        displayName: "PII Reader",
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

  async function createMember(
    email: string,
    name: string,
    status: "ACTIVE" | "INVITED",
  ): Promise<void> {
    const user = await ownerPrisma.user.create({ data: { email, name } });
    await ownerPrisma.userOrganization.create({
      data: { userId: user.id, organizationId: orgId, status },
    });
  }

  function authedGet(
    path: string,
    token: string,
    reason?: string,
  ): Promise<Response> {
    return Promise.resolve(
      tenantPiiRouter.request(path, {
        method: "GET",
        headers: {
          Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${token}`,
          ...(reason === undefined ? {} : { [PII_REASON_HEADER]: reason }),
        },
      }),
    );
  }

  beforeAll(async () => {
    tenantPiiRouter.onError(globalErrorHandler);
    platformPrisma = createPlatformTestClient();
    ownerPrisma = createPlatformOwnerTestClient();
    await clearRateLimitStore("rl:admin:tenant-pii");

    const organization = await ownerPrisma.organization.create({
      data: { name: `PII Tenant ${suffix}`, slug: `pii-tenant-${suffix}` },
    });
    orgId = organization.id;
    createdOrgIds.push(orgId);

    await createMember(activeEmail, "Active Member", "ACTIVE");
    await createMember(invitedEmail, "Invited Member", "INVITED");

    const reader = await createOperator([PLATFORM_CAPABILITIES.PII_READ.code]);
    readerId = reader.id;
    readerToken = reader.token;

    const limited = await createOperator([
      PLATFORM_CAPABILITIES.TENANTS_READ.code,
    ]);
    limitedToken = limited.token;
  });

  afterAll(async () => {
    // RESTRICT (D-027): audit history outlives its actor, so remove the fixture
    // rows before the operators and the tenant.
    if (createdOperatorIds.length > 0) {
      await ownerPrisma.auditEvent.deleteMany({
        where: { actorOperatorId: { in: createdOperatorIds } },
      });
    }
    if (createdOrgIds.length > 0) {
      await ownerPrisma.auditEvent.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await ownerPrisma.userOrganization.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await ownerPrisma.user.deleteMany({
        where: { email: { contains: suffix } },
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

  it("returns active member contact data and audits the read", async () => {
    const reason = "support case 42";
    const response = await authedGet(
      `/tenants/${orgId}/pii`,
      readerToken,
      reason,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as PiiBody;
    expect(body.data.tenantId).toBe(orgId);
    expect(body.data.members).toHaveLength(1);
    expect(body.data.members[0]?.email).toBe(activeEmail);
    expect(body.data.members[0]?.membershipStatus).toBe("ACTIVE");
    expect(
      body.data.members.some((member) => member.email === invitedEmail),
    ).toBe(false);

    const audit = await ownerPrisma.auditEvent.findFirst({
      where: {
        organizationId: orgId,
        action: PLATFORM_AUDIT_ACTIONS.TENANT_PII_READ,
      },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit?.reason).toBe(reason);
    expect(audit?.actorOperatorId).toBe(readerId);
  });

  it("denies an operator without the personal-data capability", async () => {
    const response = await authedGet(
      `/tenants/${orgId}/pii`,
      limitedToken,
      "snooping",
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
  });

  it("requires a recorded reason", async () => {
    const response = await authedGet(`/tenants/${orgId}/pii`, readerToken);

    expect(response.status).toBe(422);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe(PLATFORM_ERROR_CODE.PII_REASON_REQUIRED);
  });

  it("rejects a blank reason", async () => {
    const response = await authedGet(
      `/tenants/${orgId}/pii`,
      readerToken,
      "   ",
    );

    expect(response.status).toBe(422);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe(PLATFORM_ERROR_CODE.PII_REASON_REQUIRED);
  });

  it("returns TENANT_NOT_FOUND for an unknown tenant", async () => {
    const response = await authedGet(
      "/tenants/tenant_missing_probe/pii",
      readerToken,
      "support",
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe(PLATFORM_ERROR_CODE.TENANT_NOT_FOUND);
  });
});
