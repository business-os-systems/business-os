import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@suite/db";
import { openReview } from "../../src/services/cms/review-service.js";
import { publishSite } from "../../src/services/cms/publish-service.js";
import { restorePageVersion } from "../../src/services/cms/version-service.js";
import {
  cleanupCmsFixture,
  cmsTestEnabled,
  createCmsFixture,
  editDraft,
  readPageState,
  type CmsFixture,
} from "../helpers/cms-fixtures.js";

const RUN = Date.now().toString(36).toUpperCase();
const REVIEWER = "usr_wt351_concurrency_reviewer";
const PUBLISHER = "usr_wt351_concurrency_publisher";

let restoreFixture: CmsFixture;
let publishFixture: CmsFixture;

async function release(fixture: CmsFixture, suffix: string): Promise<void> {
  const review = await openReview({
    organizationId: fixture.organizationId,
    siteId: fixture.siteId,
    actorUserId: REVIEWER,
  });
  await publishSite({
    organizationId: fixture.organizationId,
    siteId: fixture.siteId,
    reviewId: review.reviewId,
    publisherUserId: PUBLISHER,
    idempotencyKey: "idem-concurrency-" + suffix + "-" + RUN,
    changeNote: null,
  });
}

beforeAll(async () => {
  if (!cmsTestEnabled) {
    return;
  }
  restoreFixture = await createCmsFixture({
    suffix: "concurrency_restore_" + RUN,
    pageCount: 1,
    changedPageCount: 1,
  });
  publishFixture = await createCmsFixture({
    suffix: "concurrency_publish_" + RUN,
    pageCount: 1,
    changedPageCount: 1,
  });
});

afterAll(async () => {
  if (!cmsTestEnabled) {
    return;
  }
  await cleanupCmsFixture(restoreFixture.organizationId);
  await cleanupCmsFixture(publishFixture.organizationId);
  await prisma.$disconnect();
});

async function restoreRace(pageId: string) {
  await release(restoreFixture, "one");
  await editDraft({
    organizationId: restoreFixture.organizationId,
    pageId,
    title: "Second draft",
  });
  await release(restoreFixture, "two");
  const current = await readPageState({
    organizationId: restoreFixture.organizationId,
    pageId,
  });
  return Promise.allSettled([
    restorePageVersion({
      organizationId: restoreFixture.organizationId,
      pageId,
      versionNumber: 1,
      expectedRevision: current.revision,
      actorUserId: REVIEWER,
    }),
    restorePageVersion({
      organizationId: restoreFixture.organizationId,
      pageId,
      versionNumber: 1,
      expectedRevision: current.revision,
      actorUserId: REVIEWER,
    }),
  ]);
}

async function holdEditWhilePublishing(pageId: string): Promise<Promise<unknown>> {
  const editing = prisma.$transaction(async (tx) => {
    await tx.cmsPage.update({
      where: { id: pageId },
      data: { revision: { increment: 1 } },
    });
    await tx.cmsPageContent.update({
      where: {
        pageId_organizationId: {
          pageId,
          organizationId: publishFixture.organizationId,
        },
      },
      data: { draftAst: { version: 1, schemaVersion: "2026-03", sections: [] } },
    });
    await tx.$executeRaw`SELECT pg_sleep(0.3)`;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  return editing;
}

async function expectPublishRefused(reviewId: string): Promise<void> {
  await expect(
    publishSite({
      organizationId: publishFixture.organizationId,
      siteId: publishFixture.siteId,
      reviewId,
      publisherUserId: PUBLISHER,
      idempotencyKey: "idem-concurrent-publish-" + RUN,
      changeNote: null,
    })
  ).rejects.toMatchObject({ code: "PREVIEW_REQUIRED" });
}

describe.skipIf(!cmsTestEnabled)("concurrency: restore (T099, CT-3)", () => {
  it("lets exactly one of two concurrent restores win", async () => {
    const results = await restoreRace(restoreFixture.pageIds[0] ?? "");
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const failure = rejected[0];
    if (failure?.status === "rejected") {
      expect(failure.reason).toMatchObject({ code: "VERSION_CONFLICT" });
    }
  });
});

describe.skipIf(!cmsTestEnabled)("concurrency: publish (T099, CT-3)", () => {
  it("refuses publish when an edit commits while the release is in flight", async () => {
    const pageId = publishFixture.pageIds[0] ?? "";
    const review = await openReview({
      organizationId: publishFixture.organizationId,
      siteId: publishFixture.siteId,
      actorUserId: REVIEWER,
    });
    const editing = await holdEditWhilePublishing(pageId);
    await expectPublishRefused(review.reviewId);
    await editing;
  });
});
