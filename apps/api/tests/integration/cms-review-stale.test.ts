import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@suite/db";
import { CMS_AUDIT_ACTIONS } from "@suite/website-builder/audit";
import { openReview } from "../../src/services/cms/review-service.js";
import { publishSite } from "../../src/services/cms/publish-service.js";
import {
  cleanupCmsFixture,
  cmsTestEnabled,
  createCmsFixture,
  editDraft,
  readPageState,
  type CmsFixture,
} from "../helpers/cms-fixtures.js";

const RUN = Date.now().toString(36).toUpperCase();
const REVIEWER = "usr_wt351_stale_reviewer";
const PUBLISHER = "usr_wt351_stale_publisher";

let fixture: CmsFixture;

beforeAll(async () => {
  if (!cmsTestEnabled) {
    return;
  }
  fixture = await createCmsFixture({
    suffix: "stale_" + RUN,
    pageCount: 2,
    changedPageCount: 2,
  });
});

afterAll(async () => {
  if (!cmsTestEnabled) {
    return;
  }
  await cleanupCmsFixture(fixture.organizationId);
  await prisma.$disconnect();
});

describe.skipIf(!cmsTestEnabled)("stale review rejection (T100, FR-091)", () => {
  it("refuses publish after a reviewed page changes", async () => {
    const review = await openReview({
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      actorUserId: REVIEWER,
    });
    const pageId = fixture.pageIds[0] ?? "";
    await editDraft({
      organizationId: fixture.organizationId,
      pageId,
      title: "Edited after review",
    });

    await expect(
      publishSite({
        organizationId: fixture.organizationId,
        siteId: fixture.siteId,
        reviewId: review.reviewId,
        publisherUserId: PUBLISHER,
        idempotencyKey: "idem-stale-" + RUN,
        changeNote: null,
      })
    ).rejects.toMatchObject({ code: "PREVIEW_REQUIRED" });

    const state = await readPageState({ organizationId: fixture.organizationId, pageId });
    expect(state.status).toBe("DRAFT");
    expect(state.content?.publishedAst).not.toEqual(state.content?.draftAst);
    expect(
      await prisma.cmsPageVersion.count({
        where: { organizationId: fixture.organizationId, pageId },
      })
    ).toBe(0);
    expect(
      await prisma.cmsAuditTrail.count({
        where: {
          organizationId: fixture.organizationId,
          siteId: fixture.siteId,
          action: CMS_AUDIT_ACTIONS.SITE_PUBLISHED,
        },
      })
    ).toBe(0);
  });

  it("publishes after a fresh review of the changed page", async () => {
    const review = await openReview({
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      actorUserId: REVIEWER,
    });
    const outcome = await publishSite({
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      reviewId: review.reviewId,
      publisherUserId: PUBLISHER,
      idempotencyKey: "idem-fresh-" + RUN,
      changeNote: null,
    });
    expect(outcome.pages).toHaveLength(2);
    const site = await prisma.cmsSite.findFirstOrThrow({ where: { id: fixture.siteId } });
    expect(site.status).toBe("PUBLISHED");
  });
});
