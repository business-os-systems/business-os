import { afterAll, beforeAll, expect, it } from "vitest";
import type { PrismaClient } from "@suite/db";
import { PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE, STEP_UP_TOKEN_HEADER } from "@suite/core";
import { CONTROL_SESSION_COOKIE_NAME, issueControlSession } from "@suite/auth/platform";
import { CMS_AUDIT_ACTIONS } from "@suite/website-builder/audit";
import { siteTakedownRouter } from "../../../src/routes/admin/site-takedown.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import { issueStepUpTokenForSessionToken } from "../../helpers/platform-operators.js";
import {
  createPlatformOwnerTestClient,
  createPlatformTestClient,
  platformIntegrationTestsEnabled,
} from "../../helpers/platform-db.js";
import { platformTestRpId } from "../../helpers/platform-rp.js";

loadPlatformTestEnv();

const secret = process.env.CONTROL_SESSION_SECRET;
const enabled = platformIntegrationTestsEnabled() && Boolean(secret);

interface SiteBody {
  readonly data: {
    readonly siteId: string;
    readonly fromStatus: string;
    readonly toStatus: string;
    readonly hostnames: string[];
    readonly occurredAt: string;
  };
}

interface ProblemBody {
  readonly code: string;
  readonly type: string;
}

interface ResolutionRow {
  readonly res: { readonly resolved: boolean; readonly reason?: string };
}

  const suffix = Date.now().toString(36);
  const createdOperatorIds: string[] = [];
  const createdOrgIds: string[] = [];
  let platformPrisma: PrismaClient;
  let ownerPrisma: PrismaClient;
  let operatorId: string;
  let operatorToken: string;
  let limitedToken: string;
  let keyCounter = 0;

  async function createOperator(capabilities: readonly string[]) {
    const operator = await platformPrisma.platformOperator.create({
      data: {
        email: "takedown-" + suffix + "-" + createdOperatorIds.length + "@example.com",
        displayName: "Takedown Operator",
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
    return { id: operator.id, token: issued.token };
  }

  async function createSiteFixture() {
    const organization = await ownerPrisma.organization.create({
      data: {
        name: "Takedown Tenant " + suffix + "-" + createdOrgIds.length,
        slug: "takedown-" + suffix + "-" + createdOrgIds.length,
        status: "ACTIVE",
      },
    });
    createdOrgIds.push(organization.id);
    const site = await ownerPrisma.cmsSite.create({
      data: {
        organizationId: organization.id,
        title: "River View",
        slug: "river-view-" + suffix + "-" + createdOrgIds.length,
        status: "PUBLISHED",
      },
    });
    const hostname = "host-" + suffix + "-" + createdOrgIds.length + ".business-os.site";
    await ownerPrisma.cmsDomain.create({
      data: {
        organizationId: organization.id,
        siteId: site.id,
        hostname,
        isPrimary: true,
        isSubdomain: true,
        status: "ACTIVE",
        verificationToken: "verify-" + suffix,
      },
    });
    return { organization, site, hostname };
  }

  function requireOrigin(): string {
    const origin = process.env.CONTROL_PLANE_ORIGIN;
    if (origin === undefined || origin.trim() === "") {
      throw new Error("CONTROL_PLANE_ORIGIN must be set for takedown tests");
    }
    return origin;
  }

  async function request(
    path: string,
    token: string,
    options: { readonly body?: Record<string, unknown>; readonly stepUp?: boolean; readonly key?: string } = {}
  ): Promise<Response> {
    const stepUpToken = options.stepUp === false ? null : await issueStepUpTokenForSessionToken(token);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Cookie: CONTROL_SESSION_COOKIE_NAME + "=" + token,
      Origin: requireOrigin(),
      "X-Forwarded-For": "198.51.100.21",
    };
    if (options.body !== undefined) {
      headers["Idempotency-Key"] = options.key ?? "takedown-" + suffix + "-" + ++keyCounter;
    }
    if (stepUpToken !== null) {
      headers[STEP_UP_TOKEN_HEADER] = stepUpToken;
    }
    return siteTakedownRouter.request(path, {
      method: options.body === undefined ? "GET" : "POST",
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  }

  async function resolveHost(hostname: string) {
    const rows = await ownerPrisma.$queryRaw<ResolutionRow[]>`
      SELECT public.cms_resolve_domain(${hostname}) AS res
    `;
    return rows[0]?.res;
  }

if (enabled) beforeAll(async () => {
    siteTakedownRouter.onError(globalErrorHandler);
    platformPrisma = createPlatformTestClient();
    ownerPrisma = createPlatformOwnerTestClient();
    await clearRateLimitStore("rl:admin:cms-site-takedown");
    const operator = await createOperator([PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code]);
    operatorId = operator.id;
    operatorToken = operator.token;
    const limited = await createOperator([PLATFORM_CAPABILITIES.TENANTS_READ.code]);
    limitedToken = limited.token;
  });

if (enabled) afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await ownerPrisma.auditEvent.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await ownerPrisma.cmsDomain.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await ownerPrisma.cmsSite.deleteMany({
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

it.skipIf(!enabled)("lists only the requested tenant's sites and hosts", async () => {
    const first = await createSiteFixture();
    const second = await createSiteFixture();
    const response = await request("/tenants/" + first.organization.id + "/sites", operatorToken);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { items: { id: string; hostnames: string[] }[] } };
    expect(body.data.items.map((item) => item.id)).toEqual([first.site.id]);
    expect(body.data.items[0]?.hostnames).toContain(first.hostname);
    expect(JSON.stringify(body)).not.toContain(second.site.id);
  });

it.skipIf(!enabled)("suspends a published site immediately with both audit rows and a reason", async () => {
    const fixture = await createSiteFixture();
    const response = await request(
      "/tenants/" + fixture.organization.id + "/sites/" + fixture.site.id + "/suspend",
      operatorToken,
      {
        body: { reason: "Phishing report verified", expectedStatus: "PUBLISHED" },
      }
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as SiteBody;
    expect(body.data).toMatchObject({
      siteId: fixture.site.id,
      fromStatus: "PUBLISHED",
      toStatus: "SUSPENDED",
    });
    expect(body.data.hostnames).toContain(fixture.hostname);

    const persisted = await ownerPrisma.cmsSite.findUniqueOrThrow({
      where: { id: fixture.site.id },
      select: { status: true },
    });
    expect(persisted.status).toBe("SUSPENDED");

    const platformAudit = await ownerPrisma.auditEvent.findFirst({
      where: { organizationId: fixture.organization.id, action: CMS_AUDIT_ACTIONS.SITE_SUSPENDED },
      orderBy: { occurredAt: "desc" },
    });
    expect(platformAudit?.actorOperatorId).toBe(operatorId);
    expect(platformAudit?.reason).toBe("Phishing report verified");
    expect(platformAudit?.after).toMatchObject({ status: "SUSPENDED" });

    const cmsAudit = await ownerPrisma.cmsAuditTrail.findFirst({
      where: { siteId: fixture.site.id, action: CMS_AUDIT_ACTIONS.SITE_SUSPENDED },
      orderBy: { createdAt: "desc" },
    });
    expect(cmsAudit?.changesJson).toMatchObject({
      reason: "Phishing report verified",
      fromStatus: "PUBLISHED",
      toStatus: "SUSPENDED",
    });

    const resolution = await resolveHost(fixture.hostname);
    expect(resolution?.resolved).toBe(false);
  });

it.skipIf(!enabled)("restores the site to the status recorded before suspension", async () => {
    const fixture = await createSiteFixture();
    await request(
      "/tenants/" + fixture.organization.id + "/sites/" + fixture.site.id + "/suspend",
      operatorToken,
      { body: { reason: "Abuse report", expectedStatus: "PUBLISHED" } }
    );
    const response = await request(
      "/tenants/" + fixture.organization.id + "/sites/" + fixture.site.id + "/restore",
      operatorToken,
      { body: { reason: "Review cleared the report", expectedStatus: "SUSPENDED" } }
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as SiteBody;
    expect(body.data).toMatchObject({ fromStatus: "SUSPENDED", toStatus: "PUBLISHED" });
    expect(
      (await ownerPrisma.cmsSite.findUniqueOrThrow({ where: { id: fixture.site.id } })).status
    ).toBe("PUBLISHED");
    const restoreAudit = await ownerPrisma.auditEvent.findFirst({
      where: { organizationId: fixture.organization.id, action: CMS_AUDIT_ACTIONS.SITE_RESTORED },
      orderBy: { occurredAt: "desc" },
    });
    expect(restoreAudit?.reason).toBe("Review cleared the report");
  });

it.skipIf(!enabled)("denies an operator without platform:tenants:lifecycle", async () => {
    const fixture = await createSiteFixture();
    const response = await request(
      "/tenants/" + fixture.organization.id + "/sites/" + fixture.site.id + "/suspend",
      limitedToken,
      { body: { reason: "Not authorised", expectedStatus: "PUBLISHED" } }
    );
    expect(response.status).toBe(403);
    expect(((await response.json()) as ProblemBody).code).toBe(
      PLATFORM_ERROR_CODE.CAPABILITY_DENIED
    );
    expect(
      (await ownerPrisma.cmsSite.findUniqueOrThrow({ where: { id: fixture.site.id } })).status
    ).toBe("PUBLISHED");
  });

it.skipIf(!enabled)("refuses a site id from another tenant with a not-found response", async () => {
    const first = await createSiteFixture();
    const second = await createSiteFixture();
    const response = await request(
      "/tenants/" + first.organization.id + "/sites/" + second.site.id + "/suspend",
      operatorToken,
      { body: { reason: "Cross tenant probe", expectedStatus: "PUBLISHED" } }
    );
    expect(response.status).toBe(404);
    expect(((await response.json()) as ProblemBody).code).not.toBe("CAPABILITY_DENIED");
    expect(
      (await ownerPrisma.cmsSite.findUniqueOrThrow({ where: { id: second.site.id } })).status
    ).toBe("PUBLISHED");
  });

it.skipIf(!enabled)("requires a fresh step-up token and a current expected status", async () => {
    const fixture = await createSiteFixture();
    const noStepUp = await request(
      "/tenants/" + fixture.organization.id + "/sites/" + fixture.site.id + "/suspend",
      operatorToken,
      {
        body: { reason: "Missing step-up", expectedStatus: "PUBLISHED" },
        stepUp: false,
      }
    );
    expect(noStepUp.status).toBe(403);
    expect(((await noStepUp.json()) as ProblemBody).code).toBe(
      PLATFORM_ERROR_CODE.STEP_UP_REQUIRED
    );

    const stale = await request(
      "/tenants/" + fixture.organization.id + "/sites/" + fixture.site.id + "/suspend",
      operatorToken,
      { body: { reason: "Stale status", expectedStatus: "DRAFT" } }
    );
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as ProblemBody).code).toBe(
      PLATFORM_ERROR_CODE.LIFECYCLE_CONFLICT
    );
  });
