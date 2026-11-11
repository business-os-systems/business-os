import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@suite/db";
import { openReview } from "../../src/services/cms/review-service.js";
import { publishSite } from "../../src/services/cms/publish-service.js";
import {
  cleanupCmsFixture,
  cmsTestEnabled,
  createCmsFixture,
  type CmsFixture,
} from "../helpers/cms-fixtures.js";

const RUN = Date.now().toString(36).toUpperCase();
const REVIEWER = "usr_wt351_optional_reviewer";
const PUBLISHER = "usr_wt351_optional_publisher";

let fixture: CmsFixture;

beforeAll(async () => {
  if (!cmsTestEnabled) {
    return;
  }
  fixture = await createCmsFixture({
    suffix: "optional_" + RUN,
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

describe.skipIf(!cmsTestEnabled)("review status is informational (T103, FR-104)", () => {
  it("publishes when the reviewer opened no pages", async () => {
    const review = await openReview({
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      actorUserId: REVIEWER,
    });
    expect(review.status).toBe("OPEN");
    expect(review.reviewedPageCount).toBe(0);

    const outcome = await publishSite({
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      reviewId: review.reviewId,
      publisherUserId: PUBLISHER,
      idempotencyKey: "idem-optional-" + RUN,
      changeNote: null,
    });
    expect(outcome.pages).toHaveLength(2);
    expect(
      await prisma.cmsPageVersion.count({ where: { organizationId: fixture.organizationId } })
    ).toBe(2);
  });
});
