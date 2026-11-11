import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@suite/db";
import { CMS_AUDIT_ACTIONS, CMS_AUDIT_ENTITY_TYPES } from "@suite/website-builder/audit";
import { openReview } from "../../src/services/cms/review-service.js";
import { publishSite } from "../../src/services/cms/publish-service.js";
import { listPageVersions, restorePageVersion } from "../../src/services/cms/version-service.js";
import { prunePageVersions } from "../../src/services/cms/version-retention.js";
import {
  cleanupCmsFixture,
  cmsTestEnabled,
  createCmsFixture,
  editDraft,
  readPageState,
  type CmsFixture,
} from "../helpers/cms-fixtures.js";

const RUN = Date.now().toString(36).toUpperCase();
const REVIEWER = "usr_wt351_rollback_reviewer";
const PUBLISHER = "usr_wt351_rollback_publisher";

let fixture: CmsFixture;

async function release(suffix: string): Promise<void> {
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
    idempotencyKey: "idem-rollback-" + suffix + "-" + RUN,
    changeNote: suffix,
  });
}

beforeAll(async () => {
  if (!cmsTestEnabled) {
    return;
  }
  fixture = await createCmsFixture({
    suffix: "rollback_" + RUN,
    pageCount: 1,
    changedPageCount: 1,
  });
});

afterAll(async () => {
  if (!cmsTestEnabled) {
    return;
  }
  await cleanupCmsFixture(fixture.organizationId);
  await prisma.$disconnect();
});

describe.skipIf(!cmsTestEnabled)("rollback to draft (T098, FR-033)", () => {
  it("restores a historical version into the draft without changing live content", async () => {
    const pageId = fixture.pageIds[0] ?? "";
    await release("one");
    await editDraft({
      organizationId: fixture.organizationId,
      pageId,
      title: "Second draft",
    });
    await release("two");

    const pageAfterSecondRelease = await readPageState({
      organizationId: fixture.organizationId,
      pageId,
    });
    const liveBeforeRestore = pageAfterSecondRelease.content?.publishedAst;
    const versions = await listPageVersions({
      organizationId: fixture.organizationId,
      pageId,
      limit: 20,
    });
    expect(versions.items.map((version) => version.versionNumber)).toEqual([2, 1]);
    const firstVersion = await prisma.cmsPageVersion.findFirstOrThrow({
      where: { organizationId: fixture.organizationId, pageId, versionNumber: 1 },
    });

    const restored = await restorePageVersion({
      organizationId: fixture.organizationId,
      pageId,
      versionNumber: 1,
      expectedRevision: pageAfterSecondRelease.revision,
      actorUserId: REVIEWER,
    });
    expect(restored.restoredVersion).toBe(1);
    expect(restored.revision).toBe(pageAfterSecondRelease.revision + 1);
    expect(restored.draftAst).toEqual(firstVersion.astSnapshot);

    const afterRestore = await readPageState({ organizationId: fixture.organizationId, pageId });
    expect(afterRestore.content?.draftAst).toEqual(firstVersion.astSnapshot);
    expect(afterRestore.content?.publishedAst).toEqual(liveBeforeRestore);

    const audit = await prisma.cmsAuditTrail.findFirstOrThrow({
      where: {
        organizationId: fixture.organizationId,
        action: CMS_AUDIT_ACTIONS.VERSION_RESTORED,
        entityType: CMS_AUDIT_ENTITY_TYPES.PAGE_VERSION,
      },
    });
    expect(audit.actorUserId).toBe(REVIEWER);
  });

  it("rejects a stale restore with VERSION_CONFLICT", async () => {
    const pageId = fixture.pageIds[0] ?? "";
    const current = await readPageState({ organizationId: fixture.organizationId, pageId });
    await expect(
      restorePageVersion({
        organizationId: fixture.organizationId,
        pageId,
        versionNumber: 1,
        expectedRevision: current.revision - 1,
        actorUserId: REVIEWER,
      })
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
});

describe.skipIf(!cmsTestEnabled)("version retention (T097)", () => {
  it("keeps only the newest 30 versions per page", async () => {
    const pageId = fixture.pageIds[0] ?? "";
    await Promise.all(
      Array.from({ length: 32 }, (_, index) => {
        const versionNumber = index + 3;
        return prisma.cmsPageVersion.create({
          data: {
            organizationId: fixture.organizationId,
            pageId,
            versionNumber,
            astSnapshot: { version: 1, schemaVersion: "2026-03", sections: [] },
            createdByUserId: PUBLISHER,
          },
        });
      })
    );
    const pruned = await prunePageVersions({
      organizationId: fixture.organizationId,
      pageId,
      client: prisma,
    });
    expect(pruned).toBe(4);
    const remaining = await prisma.cmsPageVersion.findMany({
      where: { organizationId: fixture.organizationId, pageId },
      orderBy: { versionNumber: "asc" },
    });
    expect(remaining).toHaveLength(30);
    expect(remaining[0]?.versionNumber).toBe(5);
    expect(remaining[remaining.length - 1]?.versionNumber).toBe(34);
  });
});
