import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PLATFORM_ERROR_CODE, QUOTA_KEYS } from "@suite/core";
import { prisma } from "@suite/db";
import type { PrismaClient } from "@suite/db";
import { CMS_AUDIT_ACTIONS } from "@suite/website-builder/audit";
import {
  openReview,
  openReviewWithExtensions,
  type PreviewExtension,
} from "../../src/services/cms/review-service.js";
import {
  publishSite,
  publishSiteWithExtensions,
  type PublishExtension,
} from "../../src/services/cms/publish-service.js";
import {
  cleanupCmsFixture,
  cmsTestEnabled,
  createCmsFixture,
  type CmsFixture,
} from "../helpers/cms-fixtures.js";
import {
  createPlatformOwnerTestClient,
  platformIntegrationTestsEnabled,
} from "../helpers/platform-db.js";

const RUN = Date.now().toString(36).toUpperCase();
const PUBLISHER = "usr_wt381_publisher";
const OPERATOR_ID = "op_wt381_" + RUN;

const quotaTestsEnabled = cmsTestEnabled && platformIntegrationTestsEnabled();

let quotaFixture: CmsFixture;
let hookFixture: CmsFixture;
let ownerClient: PrismaClient | null = null;

beforeAll(async () => {
  if (!cmsTestEnabled) {
    return;
  }
  quotaFixture = await createCmsFixture({
    suffix: "quota_" + RUN,
    pageCount: 2,
    changedPageCount: 1,
  });
  hookFixture = await createCmsFixture({
    suffix: "hooks_" + RUN,
    pageCount: 2,
    changedPageCount: 1,
  });
  if (!platformIntegrationTestsEnabled()) {
    return;
  }
  ownerClient = createPlatformOwnerTestClient();
});

afterAll(async () => {
  if (!cmsTestEnabled) {
    return;
  }
  if (ownerClient !== null) {
    await ownerClient.quota.deleteMany({
      where: { organizationId: quotaFixture.organizationId },
    });
    await ownerClient.platformOperator.deleteMany({ where: { id: OPERATOR_ID } });
    await ownerClient.$disconnect();
  }
  await cleanupCmsFixture(hookFixture.organizationId);
  await cleanupCmsFixture(quotaFixture.organizationId);
});

async function setPageLimit(limitValue: bigint): Promise<void> {
  if (ownerClient === null) {
    throw new Error("The platform owner client is required for the quota test.");
  }
  await ownerClient.platformOperator.upsert({
    where: { id: OPERATOR_ID },
    create: {
      id: OPERATOR_ID,
      email: "wt381-" + RUN.toLowerCase() + "@example.test",
      displayName: "WT381 quota operator",
      status: "ACTIVE",
    },
    update: {},
  });
  await ownerClient.quota.create({
    data: {
      organizationId: quotaFixture.organizationId,
      resourceKey: QUOTA_KEYS.PAGES,
      limitValue,
      isEnforced: true,
      updatedBy: OPERATOR_ID,
    },
  });
}

describe.skipIf(!quotaTestsEnabled)("publish-time page quota", () => {
  it("refuses a release while the tenant is over the page limit", async () => {
    await setPageLimit(1n);
    const review = await openReview({
      organizationId: quotaFixture.organizationId,
      siteId: quotaFixture.siteId,
      actorUserId: PUBLISHER,
    });

    await expect(
      publishSite({
        organizationId: quotaFixture.organizationId,
        siteId: quotaFixture.siteId,
        reviewId: review.reviewId,
        publisherUserId: PUBLISHER,
        idempotencyKey: "idem-quota-" + RUN,
        changeNote: null,
      })
    ).rejects.toMatchObject({
      status: 409,
      code: PLATFORM_ERROR_CODE.QUOTA_EXCEEDED,
    });

    const site = await prisma.cmsSite.findUniqueOrThrow({
      where: { id: quotaFixture.siteId },
    });
    expect(site.status).toBe("DRAFT");
    const release = await prisma.cmsAuditTrail.findFirst({
      where: {
        organizationId: quotaFixture.organizationId,
        action: CMS_AUDIT_ACTIONS.SITE_PUBLISHED,
      },
    });
    expect(release).toBeNull();
  });
});

describe.skipIf(!cmsTestEnabled)("publish extension hook", () => {
  it("notifies a publish extension exactly once and isolates its failure", async () => {
    const captured: { reviewId: string; pageCount: number; replayed: boolean }[] = [];
    let laterExtensionRan = false;
    const capture: PublishExtension = {
      name: "capture",
      afterPublished: (context) => {
        captured.push({
          reviewId: context.reviewId,
          pageCount: context.pageCount,
          replayed: context.replayed,
        });
      },
    };
    const failing: PublishExtension = {
      name: "failing",
      afterPublished: () => {
        throw new Error("publisher notification is unavailable");
      },
    };
    const later: PublishExtension = {
      name: "later",
      afterPublished: () => {
        laterExtensionRan = true;
      },
    };
    const review = await openReview({
      organizationId: hookFixture.organizationId,
      siteId: hookFixture.siteId,
      actorUserId: PUBLISHER,
    });
    const input = {
      organizationId: hookFixture.organizationId,
      siteId: hookFixture.siteId,
      reviewId: review.reviewId,
      publisherUserId: PUBLISHER,
      idempotencyKey: "idem-hook-" + RUN,
      changeNote: null,
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const outcome = await publishSiteWithExtensions({
      input,
      extensions: [capture, failing, later],
    });

    expect(outcome.replayed).toBe(false);
    expect(captured).toEqual([
      { reviewId: review.reviewId, pageCount: 1, replayed: false },
    ]);
    expect(laterExtensionRan).toBe(true);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

});

describe.skipIf(!cmsTestEnabled)("publish extension replay", () => {
  it("does not notify again when the release is replayed", async () => {
    const captured: string[] = [];
    const extension: PublishExtension = {
      name: "capture",
      afterPublished: (context) => {
        captured.push(context.reviewId);
      },
    };
    const review = await openReview({
      organizationId: hookFixture.organizationId,
      siteId: hookFixture.siteId,
      actorUserId: PUBLISHER,
    });
    const input = {
      organizationId: hookFixture.organizationId,
      siteId: hookFixture.siteId,
      reviewId: review.reviewId,
      publisherUserId: PUBLISHER,
      idempotencyKey: "idem-hook-replay-" + RUN,
      changeNote: null,
    };

    await publishSiteWithExtensions({ input, extensions: [extension] });
    const replay = await publishSiteWithExtensions({ input, extensions: [extension] });

    expect(replay.replayed).toBe(true);
    expect(captured).toEqual([review.reviewId]);
  });

});

describe.skipIf(!cmsTestEnabled)("preview extension hook", () => {
  it("notifies a preview extension after the review commits and isolates its failure", async () => {
    const captured: string[] = [];
    let laterExtensionRan = false;
    const extension: PreviewExtension = {
      name: "capture",
      afterPreviewOpened: (context) => {
        captured.push(context.reviewId);
      },
    };
    const failing: PreviewExtension = {
      name: "failing",
      afterPreviewOpened: () => {
        throw new Error("feedback request is unavailable");
      },
    };
    const later: PreviewExtension = {
      name: "later",
      afterPreviewOpened: () => {
        laterExtensionRan = true;
      },
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const summary = await openReviewWithExtensions({
      input: {
        organizationId: hookFixture.organizationId,
        siteId: hookFixture.siteId,
        actorUserId: PUBLISHER,
      },
      extensions: [extension, failing, later],
    });

    expect(captured).toEqual([summary.reviewId]);
    expect(laterExtensionRan).toBe(true);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
    const stored = await prisma.cmsAuditTrail.count({
      where: {
        organizationId: hookFixture.organizationId,
        action: CMS_AUDIT_ACTIONS.REVIEW_OPENED,
        entityId: summary.reviewId,
      },
    });
    expect(stored).toBe(1);
  });
});
