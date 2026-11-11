import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@suite/db";
import { PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE } from "@suite/core";
import { CMS_AUDIT_ACTIONS, CMS_AUDIT_ENTITY_TYPES } from "@suite/website-builder/audit";
import { siteDeletionRouter } from "../../../src/routes/admin/site-deletion.js";
import { confirmSiteDeletion } from "../../../src/services/admin/site-deletion.service.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createOperatorFixture,
  parseProblem,
  platformOperatorTestsEnabled,
  sendOperatorRequest,
  type OperatorFixture,
} from "../../helpers/platform-operators.js";

loadPlatformTestEnv();

const enabled = platformOperatorTestsEnabled();
const RUN = Date.now().toString(36).toUpperCase();
const ORG = "org_wt378_delete_" + RUN;
const FLAGGED_SITE = "site_wt378_flagged_" + RUN;
const UNFLAGGED_SITE = "site_wt378_unflagged_" + RUN;
const FLAGGED_SLUG = "flagged-" + RUN.toLowerCase();
const UNFLAGGED_SLUG = "unflagged-" + RUN.toLowerCase();
const REASON = "Inactive for more than a year, removal approved by the owner";
const EXPECTED_STATUS = "PUBLISHED" as const;

let fixture: OperatorFixture;
let ownerPrisma: PrismaClient;
let lifecycleToken = "";
let lifecycleOperatorId = "";
let limitedToken = "";
let seeded = false;

interface SiteConfirmationInput {
  readonly token: string;
  readonly siteId: string;
  readonly slug: string;
  readonly stepUpToken?: string | null;
}

async function seedSiteRow(
  siteId: string,
  slug: string,
  deletionFlaggedAt: Date | null,
): Promise<void> {
  await ownerPrisma.cmsSite.create({
    data: {
      id: siteId,
      organizationId: ORG,
      title: "Deletion site " + slug,
      slug,
      status: EXPECTED_STATUS,
      deletionFlaggedAt,
      updatedAt: deletionFlaggedAt ?? new Date(),
    },
  });
}

async function seedPage(siteId: string): Promise<void> {
  await ownerPrisma.cmsPage.create({
    data: {
      id: "page_" + siteId,
      organizationId: ORG,
      siteId,
      title: "Home",
      slug: "/",
      isHomePage: true,
      orderIndex: 0,
      status: EXPECTED_STATUS,
      revision: 1,
      content: {
        create: {
          draftAst: { version: 1, schemaVersion: "2026-03", sections: [] },
          publishedAst: { version: 1, schemaVersion: "2026-03", sections: [] },
        },
      },
    },
  });
}

async function seedReferences(siteId: string, slug: string): Promise<void> {
  await Promise.all([
    ownerPrisma.cmsInquiry.create({
      data: {
        organizationId: ORG,
        siteId,
        blockId: "block_form",
        idempotencyKey: "idem-" + siteId,
        payloadJson: { message: "hello" },
      },
    }),
    ownerPrisma.cmsDomain.create({
      data: {
        organizationId: ORG,
        siteId,
        hostname: slug + ".example.test",
        isPrimary: true,
        verificationToken: "token-" + siteId,
        status: "ACTIVE",
        sslActive: true,
      },
    }),
    ownerPrisma.cmsUrlRedirect.create({
      data: { organizationId: ORG, siteId, sourcePath: "/old", targetUrl: "/" },
    }),
  ]);
}

async function seedSite(
  siteId: string,
  slug: string,
  deletionFlaggedAt: Date | null,
): Promise<void> {
  await seedSiteRow(siteId, slug, deletionFlaggedAt);
  await seedPage(siteId);
  await seedReferences(siteId, slug);
}

async function cleanup(): Promise<void> {
  if (!seeded) {
    return;
  }
  const scope = { organizationId: ORG };
  await ownerPrisma.cmsAuditTrail.deleteMany({ where: scope });
  await ownerPrisma.cmsPage.deleteMany({ where: scope });
  await ownerPrisma.cmsInquiry.deleteMany({ where: scope });
  await ownerPrisma.cmsDomain.deleteMany({ where: scope });
  await ownerPrisma.cmsUrlRedirect.deleteMany({ where: scope });
  await ownerPrisma.cmsSite.deleteMany({ where: scope });
  await ownerPrisma.organization.deleteMany({ where: { id: ORG } });
}

function confirmationPath(siteId: string): string {
  return "/tenants/" + ORG + "/sites/" + siteId + "/confirm-deletion";
}

function confirmRequest(input: SiteConfirmationInput): Promise<Response> {
  return sendOperatorRequest(siteDeletionRouter, {
    method: "POST",
    path: confirmationPath(input.siteId),
    token: input.token,
    body: {
      reason: REASON,
      expectedStatus: EXPECTED_STATUS,
      confirmSlug: input.slug,
    },
    ...(input.stepUpToken === undefined ? {} : { stepUpToken: input.stepUpToken }),
  });
}

async function assertRemovalCommitted(siteId: string): Promise<void> {
  const site = await ownerPrisma.cmsSite.findFirstOrThrow({ where: { id: siteId } });
  expect(site.status).toBe("ARCHIVED");
  expect(site.deletionConfirmedAt).not.toBeNull();
  expect(site.deletionConfirmedBy).toBe(lifecycleOperatorId);
  expect(await ownerPrisma.cmsPage.count({ where: { siteId } })).toBe(0);
  expect(await ownerPrisma.cmsInquiry.count({ where: { siteId } })).toBe(0);
  expect(await ownerPrisma.cmsDomain.count({ where: { siteId } })).toBe(0);

  const audit = await ownerPrisma.cmsAuditTrail.findFirstOrThrow({
    where: {
      organizationId: ORG,
      siteId,
      action: CMS_AUDIT_ACTIONS.SITE_DELETION_CONFIRMED,
      entityType: CMS_AUDIT_ENTITY_TYPES.SITE,
    },
  });
  expect(audit.actorUserId).toBe(lifecycleOperatorId);
  expect(audit.changesJson).toMatchObject({ purgedPages: 1, purgedInquiries: 1 });
}

beforeAll(async () => {
  if (!enabled) {
    return;
  }
  siteDeletionRouter.onError(globalErrorHandler);
  await clearRateLimitStore("rl:admin:cms-site-deletion");
  fixture = await createOperatorFixture("site-deletion-" + RUN.toLowerCase());
  ownerPrisma = fixture.ownerPrisma;
  await ownerPrisma.organization.create({
    data: { id: ORG, name: "WT378 deletion", slug: "wt378-deletion-" + RUN.toLowerCase() },
  });
  const lifecycle = await fixture.createOperator([PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code]);
  lifecycleToken = lifecycle.token;
  lifecycleOperatorId = lifecycle.id;
  const limited = await fixture.createOperator([PLATFORM_CAPABILITIES.TENANTS_READ.code]);
  limitedToken = limited.token;
  await seedSite(FLAGGED_SITE, FLAGGED_SLUG, new Date("2026-10-01T00:00:00Z"));
  await seedSite(UNFLAGGED_SITE, UNFLAGGED_SLUG, null);
  seeded = true;
});

afterAll(async () => {
  if (!enabled) {
    return;
  }
  await cleanup();
  await fixture.cleanup();
});

describe.skipIf(!enabled)("site deletion lifecycle (FR-097, FR-099, T158)", () => {
  it("lists only flagged sites and leaves their content intact", async () => {
    const response = await sendOperatorRequest(siteDeletionRouter, {
      method: "GET",
      path: "/tenants/" + ORG + "/sites/flagged",
      token: lifecycleToken,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { items: { id: string }[] } };
    expect(body.data.items.map((item) => item.id)).toEqual([FLAGGED_SITE]);
    expect(await ownerPrisma.cmsPage.count({ where: { organizationId: ORG } })).toBe(2);
  });

  it("rejects removal without a fresh human step-up confirmation", async () => {
    const response = await confirmRequest({
      token: lifecycleToken,
      siteId: FLAGGED_SITE,
      slug: FLAGGED_SLUG,
      stepUpToken: null,
    });
    expect(response.status).toBe(403);
    expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.STEP_UP_REQUIRED);
    const site = await ownerPrisma.cmsSite.findFirstOrThrow({ where: { id: FLAGGED_SITE } });
    expect(site.deletionConfirmedAt).toBeNull();
  });

  it("rejects a confirmation slug that does not name the site", async () => {
    const response = await confirmRequest({
      token: lifecycleToken,
      siteId: FLAGGED_SITE,
      slug: "wrong-slug",
    });
    expect(response.status).toBe(422);
    expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.SLUG_MISMATCH);
  });

  it("rejects removal of a site that the lifecycle job did not flag", async () => {
    const response = await confirmRequest({
      token: lifecycleToken,
      siteId: UNFLAGGED_SITE,
      slug: UNFLAGGED_SLUG,
    });
    expect(response.status).toBe(422);
    expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.INVALID_TRANSITION);
  });
});

describe.skipIf(!enabled)("site deletion confirmation (FR-097, FR-099)", () => {
  it("requires the lifecycle capability on the list and the confirmation", async () => {
    const list = await sendOperatorRequest(siteDeletionRouter, {
      method: "GET",
      path: "/tenants/" + ORG + "/sites/flagged",
      token: limitedToken,
    });
    expect(list.status).toBe(403);
    expect((await parseProblem(list)).code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
    const confirm = await confirmRequest({
      token: limitedToken,
      siteId: FLAGGED_SITE,
      slug: FLAGGED_SLUG,
    });
    expect(confirm.status).toBe(403);
    expect((await parseProblem(confirm)).code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
  });

});

describe.skipIf(!enabled)("site deletion guards and audit (FR-097, FR-099)", () => {
  it("requires a meaningful reason before touching the site", async () => {
    await expect(
      confirmSiteDeletion({
        organizationId: ORG,
        siteId: UNFLAGGED_SITE,
        body: {
          reason: "no",
          expectedStatus: EXPECTED_STATUS,
          confirmSlug: UNFLAGGED_SLUG,
        },
        operatorId: lifecycleOperatorId,
        stepUpToken: null,
      }),
    ).rejects.toMatchObject({ code: PLATFORM_ERROR_CODE.VALIDATION_FAILED });
  });

  it("rejects a stale site status", async () => {
    const response = await sendOperatorRequest(siteDeletionRouter, {
      method: "POST",
      path: confirmationPath(FLAGGED_SITE),
      token: lifecycleToken,
      body: {
        reason: REASON,
        expectedStatus: "DRAFT",
        confirmSlug: FLAGGED_SLUG,
      },
    });
    expect(response.status).toBe(409);
    expect((await parseProblem(response)).code).toBe(
      PLATFORM_ERROR_CODE.LIFECYCLE_CONFLICT,
    );
  });

  it("returns not found for a site outside the tenant", async () => {
    const response = await sendOperatorRequest(siteDeletionRouter, {
      method: "POST",
      path: confirmationPath("site_wt378_missing_" + RUN),
      token: lifecycleToken,
      body: {
        reason: REASON,
        expectedStatus: EXPECTED_STATUS,
        confirmSlug: "missing",
      },
    });
    expect(response.status).toBe(404);
    expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.NOT_FOUND);
  });

});

describe.skipIf(!enabled)("site deletion execution (FR-097, FR-099)", () => {
  it("removes content only after a confirmed human action and audits it", async () => {
    const response = await confirmRequest({
      token: lifecycleToken,
      siteId: FLAGGED_SITE,
      slug: FLAGGED_SLUG,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { status: string; purgedPages: number; purgedInquiries: number };
    };
    expect(body.data.status).toBe("ARCHIVED");
    expect(body.data.purgedPages).toBe(1);
    expect(body.data.purgedInquiries).toBe(1);
    await assertRemovalCommitted(FLAGGED_SITE);
  });

  it("rejects a second removal confirmation for the same site", async () => {
    const response = await sendOperatorRequest(siteDeletionRouter, {
      method: "POST",
      path: confirmationPath(FLAGGED_SITE),
      token: lifecycleToken,
      body: {
        reason: REASON,
        expectedStatus: "ARCHIVED",
        confirmSlug: FLAGGED_SLUG,
      },
    });
    expect(response.status).toBe(409);
    expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.LIFECYCLE_CONFLICT);
  });
});
