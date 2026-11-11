import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { PERMISSIONS, type PermissionCode } from "@suite/core";
import { prisma } from "@suite/db";
import { CMS_AUDIT_ACTIONS } from "@suite/website-builder/audit";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";
import { createCmsReviewRouter } from "../../src/routes/cms/review.js";
import { openReview } from "../../src/services/cms/review-service.js";
import { publishSite } from "../../src/services/cms/publish-service.js";
import {
  cleanupCmsFixture,
  cmsTestEnabled,
  createCmsFixture,
  type CmsFixture,
} from "../helpers/cms-fixtures.js";

const RUN = Date.now().toString(36).toUpperCase();
const REVIEWER = "usr_wt351_reviewer";
const PUBLISHER = "usr_wt351_publisher";
const CMS_SITES_PATH = "/api/v1/cms/sites/";

interface Variables {
  user: { permissions?: string[] };
  userId?: string;
  organizationId?: string;
}

function createReviewApp(input: {
  readonly permissions: readonly PermissionCode[];
  readonly organizationId: string;
  readonly userId: string;
}) {
  const app = new Hono<{ Variables: Variables }>();
  app.onError(globalErrorHandler);
  app.use("*", async (c, next) => {
    c.set("user", { permissions: [...input.permissions] });
    c.set("userId", input.userId);
    c.set("organizationId", input.organizationId);
    await next();
  });
  app.route("/api/v1/cms", createCmsReviewRouter());
  return app;
}

async function postJson(
  app: Hono<{ Variables: Variables }>,
  path: string,
  body?: unknown,
  idempotencyKey?: string
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (idempotencyKey !== undefined) {
    headers["Idempotency-Key"] = idempotencyKey;
  }
  return app.request(path, {
    method: "POST",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

let fixture: CmsFixture;
let otherFixture: CmsFixture;

async function openReviewViaRoute(
  app: Hono<{ Variables: Variables }>,
  siteId: string
): Promise<string> {
  const opened = await postJson(app, CMS_SITES_PATH + siteId + "/review");
  expect(opened.status).toBe(201);
  const body = (await opened.json()) as {
    data: { review: { reviewId: string }; canPublish: boolean };
  };
  expect(body.data.review.reviewId.length).toBeGreaterThan(0);
  return body.data.review.reviewId;
}

async function publishFirstRelease(): Promise<{ reviewer: string; publisher: string }> {
  const review = await openReview({
    organizationId: fixture.organizationId,
    siteId: fixture.siteId,
    actorUserId: REVIEWER,
  });
  expect(review.changedPageCount).toBe(2);
  await publishSite({
    organizationId: fixture.organizationId,
    siteId: fixture.siteId,
    reviewId: review.reviewId,
    publisherUserId: PUBLISHER,
    idempotencyKey: "idem-publish-" + RUN,
    changeNote: "Wave two release",
  });
  return { reviewer: REVIEWER, publisher: PUBLISHER };
}

async function assertReleaseSnapshots(expected: { reviewer: string; publisher: string }): Promise<void> {
  const site = await prisma.cmsSite.findFirstOrThrow({ where: { id: fixture.siteId } });
  expect(site.status).toBe("PUBLISHED");
  const versions = await prisma.cmsPageVersion.findMany({
    where: { organizationId: fixture.organizationId, pageId: { in: [...fixture.pageIds] } },
  });
  expect(versions).toHaveLength(2);
  for (const version of versions) {
    expect(version.label).toBe("Wave two release");
    expect(version.createdByUserId).toBe(expected.publisher);
  }
  const audit = await prisma.cmsAuditTrail.findFirstOrThrow({
    where: {
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      action: CMS_AUDIT_ACTIONS.SITE_PUBLISHED,
    },
  });
  expect(audit.actorUserId).toBe(expected.publisher);
  const auditRecord = audit.changesJson as Record<string, unknown>;
  expect(auditRecord.reviewerUserId).toBe(expected.reviewer);
  expect(auditRecord.publisherUserId).toBe(expected.publisher);
}

beforeAll(async () => {
  if (!cmsTestEnabled) {
    return;
  }
  fixture = await createCmsFixture({
    suffix: "publish_" + RUN,
    pageCount: 3,
    changedPageCount: 2,
  });
  otherFixture = await createCmsFixture({
    suffix: "publish_other_" + RUN,
    pageCount: 1,
    changedPageCount: 1,
  });
});

afterAll(async () => {
  if (!cmsTestEnabled) {
    return;
  }
  await cleanupCmsFixture(fixture.organizationId);
  await cleanupCmsFixture(otherFixture.organizationId);
  await prisma.$disconnect();
});

describe.skipIf(!cmsTestEnabled)("site-wide publish", () => {
  it("publishes every changed page atomically and snapshots each one", async () => {
    const expected = await publishFirstRelease();
    await assertReleaseSnapshots(expected);
  });

  it("replays one idempotency key without a second release", async () => {
    const review = await openReview({
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      actorUserId: REVIEWER,
    });
    const key = "idem-replay-" + RUN;
    const input = {
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      reviewId: review.reviewId,
      publisherUserId: PUBLISHER,
      idempotencyKey: key,
      changeNote: null,
    };
    const first = await publishSite(input);
    const versionCount = await prisma.cmsPageVersion.count({
      where: { organizationId: fixture.organizationId, pageId: { in: [...fixture.pageIds] } },
    });
    // A second review is not needed: the request id alone identifies the release.
    const replay = await publishSite(input);
    expect(replay.replayed).toBe(true);
    expect(replay.publishedAt).toBe(first.publishedAt);
    expect(
      await prisma.cmsPageVersion.count({
        where: { organizationId: fixture.organizationId, pageId: { in: [...fixture.pageIds] } },
      })
    ).toBe(versionCount);
  });

});

describe.skipIf(!cmsTestEnabled)("publish idempotency conflicts", () => {
  it("refuses a request id reused with a different review", async () => {
    const fresh = await openReview({
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      actorUserId: REVIEWER,
    });
    const key = "idem-conflict-" + RUN;
    const first = await openReview({
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      actorUserId: REVIEWER,
    });
    await publishSite({
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      reviewId: first.reviewId,
      publisherUserId: PUBLISHER,
      idempotencyKey: key,
      changeNote: null,
    });
    await expect(
      publishSite({
        organizationId: fixture.organizationId,
        siteId: fixture.siteId,
        reviewId: fresh.reviewId,
        publisherUserId: PUBLISHER,
        idempotencyKey: key,
        changeNote: null,
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
});

describe.skipIf(!cmsTestEnabled)("review and publish capabilities", () => {
  it("lets a publish-only operator preview and then publish (FR-092)", async () => {
    const app = createReviewApp({
      permissions: [PERMISSIONS.WEBSITE_BUILDER.PUBLISH],
      organizationId: fixture.organizationId,
      userId: PUBLISHER,
    });
    const reviewId = await openReviewViaRoute(app, fixture.siteId);
    const viewed = await app.request(
      CMS_SITES_PATH + fixture.siteId + "/review/" + reviewId
    );
    expect(viewed.status).toBe(200);
    const published = await postJson(
      app,
      CMS_SITES_PATH + fixture.siteId + "/publish",
      { reviewId },
      "idem-publish-only-" + RUN
    );
    expect(published.status).toBe(200);
  });

  it("denies publish to an author who can preview but cannot publish", async () => {
    const app = createReviewApp({
      permissions: [
        PERMISSIONS.WEBSITE_BUILDER.PAGES_PREVIEW,
        PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE,
      ],
      organizationId: otherFixture.organizationId,
      userId: REVIEWER,
    });
    const reviewId = await openReviewViaRoute(app, otherFixture.siteId);
    const published = await postJson(
      app,
      CMS_SITES_PATH + otherFixture.siteId + "/publish",
      { reviewId },
      "idem-denied-" + RUN
    );
    expect(published.status).toBe(403);
    const body = (await published.json()) as { code: string };
    expect(body.code).toBe("CAPABILITY_DENIED");
  });

  it("reports another tenant's review as not found", async () => {
    const review = await openReview({
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      actorUserId: REVIEWER,
    });
    const app = createReviewApp({
      permissions: [PERMISSIONS.WEBSITE_BUILDER.PUBLISH],
      organizationId: otherFixture.organizationId,
      userId: PUBLISHER,
    });
    const response = await app.request(
      CMS_SITES_PATH + fixture.siteId + "/review/" + review.reviewId
    );
    expect(response.status).toBe(404);
  });
});
