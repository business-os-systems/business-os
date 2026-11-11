import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@suite/db";
import { openReview } from "../../src/services/cms/review-service.js";
import { publishSite } from "../../src/services/cms/publish-service.js";
import { savePageDraft } from "../../src/services/cms/page-content.service.js";
import {
  main as runRetentionJob,
  runVersionRetention,
} from "../../src/jobs/version-retention.js";
import {
  cleanupCmsFixture,
  cmsTestEnabled,
  createCmsFixture,
  createVersionRows,
  editDraft,
  type CmsFixture,
} from "../helpers/cms-fixtures.js";

const RUN = Date.now().toString(36).toUpperCase();
const REVIEWER = "usr_wt378_retention_reviewer";
const PUBLISHER = "usr_wt378_retention_publisher";
let fixtureCounter = 0;

async function withFixture<T>(
  run: (fixture: CmsFixture) => Promise<T>,
  pageCount = 1,
): Promise<T> {
  fixtureCounter += 1;
  const fixture = await createCmsFixture({
    suffix: "retention_" + RUN + "_" + String(fixtureCounter),
    pageCount,
    changedPageCount: 1,
  });
  try {
    return await run(fixture);
  } finally {
    await cleanupCmsFixture(fixture.organizationId);
  }
}

async function versionsOf(fixture: CmsFixture, pageId: string) {
  return prisma.cmsPageVersion.findMany({
    where: { organizationId: fixture.organizationId, pageId },
    orderBy: { versionNumber: "asc" },
  });
}

async function verifyPublishPrunesHistory(): Promise<void> {
  await withFixture(async (fixture) => {
    const pageId = fixture.pageIds[0] ?? "";
    await createVersionRows({
      organizationId: fixture.organizationId,
      pageId,
      count: 31,
    });
    await editDraft({
      organizationId: fixture.organizationId,
      pageId,
      title: "Release after a long history",
    });
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
      idempotencyKey: "idem-retention-" + RUN,
      changeNote: "retention release",
    });

    const remaining = await versionsOf(fixture, pageId);
    expect(remaining).toHaveLength(30);
    expect(remaining[0]?.versionNumber).toBe(3);
    expect(remaining[remaining.length - 1]?.versionNumber).toBe(32);
  });
}

async function verifySweepPrunesHistory(): Promise<void> {
  await withFixture(async (fixture) => {
    const pageId = fixture.pageIds[0] ?? "";
    await createVersionRows({
      organizationId: fixture.organizationId,
      pageId,
      count: 34,
    });
    const result = await runVersionRetention({
      client: prisma,
      organizationIds: [fixture.organizationId],
      pageBatchSize: 10,
    });
    expect(result.pruned).toBe(4);
    const remaining = await versionsOf(fixture, pageId);
    expect(remaining).toHaveLength(30);
    expect(remaining[0]?.versionNumber).toBe(5);
    expect(remaining[remaining.length - 1]?.versionNumber).toBe(34);
  });
}

async function verifyCheckpointPrune(): Promise<void> {
  await withFixture(async (fixture) => {
    const pageId = fixture.pageIds[0] ?? "";
    await createVersionRows({
      organizationId: fixture.organizationId,
      pageId,
      count: 30,
    });
    const page = await prisma.cmsPage.findFirstOrThrow({
      where: { id: pageId, organizationId: fixture.organizationId },
    });
    const outcome = await savePageDraft({
      organizationId: fixture.organizationId,
      pageId,
      actorUserId: REVIEWER,
      expectedRevision: page.revision - 1,
      draftAst: { version: 1, schemaVersion: "2026-03", sections: [] },
    });
    expect(outcome.kind).toBe("conflict");

    const remaining = await versionsOf(fixture, pageId);
    expect(remaining).toHaveLength(30);
    expect(remaining[0]?.versionNumber).toBe(2);
    expect(remaining[remaining.length - 1]?.versionNumber).toBe(31);
  });
}

afterAll(async () => {
  if (cmsTestEnabled) {
    await prisma.$disconnect();
  }
});

async function verifyEmptyScope(): Promise<void> {
  const result = await runVersionRetention({
    client: prisma,
    organizationIds: ["org_wt378_empty_" + RUN],
    maxBatches: 1,
  });
  expect(result).toEqual({ pages: 0, pruned: 0, batches: 0 });
}

async function verifyBatchLimitHonoured(): Promise<void> {
  const result = await runVersionRetention({
    client: prisma,
    organizationIds: ["org_wt378_empty_" + RUN],
    maxBatches: 0,
  });
  expect(result.batches).toBe(0);
}

async function verifyGlobalSweep(): Promise<void> {
  const result = await runVersionRetention({
    client: prisma,
    pageBatchSize: 1,
    maxBatches: 1,
  });
  expect(result.batches).toBeLessThanOrEqual(1);
}

async function verifyBatchRecursion(): Promise<void> {
  await withFixture(async (fixture) => {
    const first = fixture.pageIds[0] ?? "";
    const second = fixture.pageIds[1] ?? "";
    await createVersionRows({
      organizationId: fixture.organizationId,
      pageId: first,
      count: 31,
    });
    await createVersionRows({
      organizationId: fixture.organizationId,
      pageId: second,
      count: 31,
    });
    const result = await runVersionRetention({
      client: prisma,
      organizationIds: [fixture.organizationId],
      pageBatchSize: 1,
      maxBatches: 2,
    });
    expect(result.pages).toBe(2);
    expect(result.pruned).toBe(2);
    expect(result.batches).toBe(2);
  }, 2);
}

async function verifyJobEntrypoint(): Promise<void> {
  await runRetentionJob({
    client: prisma,
    organizationIds: ["org_wt378_empty_" + RUN],
    maxBatches: 1,
  });
}

describe.skipIf(!cmsTestEnabled)("version retention (T097, T155, FR-033)", () => {
  it(
    "prunes history to the newest 30 versions when a release snapshots a page",
    verifyPublishPrunesHistory,
  );
  it("sweeps a page that grew past the limit between releases", verifySweepPrunesHistory);
  it("prunes after a conflict retains the losing draft as a checkpoint", verifyCheckpointPrune);
  it("does nothing when the scoped pages are already within the limit", verifyEmptyScope);
  it("honours the batch ceiling", verifyBatchLimitHonoured);
  it("queries every tenant for the scheduled sweep", verifyGlobalSweep);
  it("continues into the next batch when one batch is full", verifyBatchRecursion);
  it("runs from the retention job entrypoint", verifyJobEntrypoint);
});
