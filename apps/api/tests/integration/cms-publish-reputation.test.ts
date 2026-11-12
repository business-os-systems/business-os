import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@suite/db";
import { ValidationError, ServiceUnavailableError } from "@suite/core/errors";
import { CMS_AUDIT_ACTIONS } from "@suite/website-builder/audit";
import { openReview } from "../../src/services/cms/review-service.js";
import { publishSite } from "../../src/services/cms/publish-service.js";
import {
  cleanupCmsFixture,
  cmsTestEnabled,
  createCmsFixture,
  type CmsFixture,
} from "../helpers/cms-fixtures.js";

const RUN = Date.now().toString(36).toUpperCase();
const PUBLISHER = "usr_wt377_publisher";
const HOST = "publish-" + RUN + ".business-os.site";
const REVIEW_HOST = "admin-" + RUN + ".business-os.site";

interface FixtureWithSite extends CmsFixture {
  readonly hostname: string;
}

async function createFixture(suffix: string, hostname: string): Promise<FixtureWithSite> {
  const fixture = await createCmsFixture({
    suffix: "reputation_" + suffix + "_" + RUN,
    pageCount: 1,
    changedPageCount: 1,
  });
  await prisma.cmsDomain.create({
    data: {
      organizationId: fixture.organizationId,
      siteId: fixture.siteId,
      hostname,
      isPrimary: true,
      isSubdomain: true,
      status: "ACTIVE",
      verificationToken: "verify-" + suffix + "-" + RUN,
    },
  });
  return { ...fixture, hostname };
}

async function reviewFor(fixture: CmsFixture): Promise<string> {
  const review = await openReview({
    organizationId: fixture.organizationId,
    siteId: fixture.siteId,
    actorUserId: "usr_wt377_reviewer",
  });
  return review.reviewId;
}

function publish(fixture: CmsFixture, reviewId: string, key: string) {
  return publishSite({
    organizationId: fixture.organizationId,
    siteId: fixture.siteId,
    reviewId,
    publisherUserId: PUBLISHER,
    idempotencyKey: key,
    changeNote: null,
  });
}

async function publishedAuditCount(organizationId: string): Promise<number> {
  return prisma.cmsAuditTrail.count({
    where: { organizationId, action: CMS_AUDIT_ACTIONS.SITE_PUBLISHED },
  });
}

let workDir = "";
let feedCounter = 0;

async function writeFeed(blockedHosts: readonly string[]): Promise<void> {
  const path = join(workDir, "feed-" + ++feedCounter + ".json");
  await writeFile(
    path,
    JSON.stringify({ updatedAt: "2026-11-12T00:00:00.000Z", blockedHosts })
  );
  process.env.ABUSE_REPUTATION_FEED_PATH = path;
}

let blockedFixture: FixtureWithSite;
let unavailableFixture: FixtureWithSite;
let reviewFixture: FixtureWithSite;

beforeAll(async () => {
  if (!cmsTestEnabled) {
    return;
  }
  workDir = await mkdtemp(join(tmpdir(), "wt377-reputation-"));
  blockedFixture = await createFixture("blocked", HOST);
  unavailableFixture = await createFixture("unavailable", "unavailable-" + RUN + ".business-os.site");
  reviewFixture = await createFixture("review", REVIEW_HOST);
});

afterAll(async () => {
  delete process.env.ABUSE_REPUTATION_FEED_PATH;
  if (!cmsTestEnabled) {
    return;
  }
  await cleanupCmsFixture(blockedFixture.organizationId);
  await cleanupCmsFixture(unavailableFixture.organizationId);
  await cleanupCmsFixture(reviewFixture.organizationId);
  await rm(workDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe.skipIf(!cmsTestEnabled)("Publish-time reputation", () => {
  it("refuses a publish when the feed lists the site's active host", async () => {
    await writeFeed([HOST]);
    const reviewId = await reviewFor(blockedFixture);
    const before = await publishedAuditCount(blockedFixture.organizationId);

    await expect(publish(blockedFixture, reviewId, "idem-blocked-" + RUN)).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(await publishedAuditCount(blockedFixture.organizationId)).toBe(before);

    const verdict = await prisma.cmsAuditTrail.findFirstOrThrow({
      where: {
        organizationId: blockedFixture.organizationId,
        action: CMS_AUDIT_ACTIONS.REPUTATION_VERDICT_RECORDED,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(verdict.changesJson).toMatchObject({ verdict: "BLOCKED", trigger: "PUBLISH" });
  });

  it("publishes once the same host is clear, keeping the review valid", async () => {
    await writeFeed([]);
    const reviewId = await reviewFor(blockedFixture);
    const outcome = await publish(blockedFixture, reviewId, "idem-clear-" + RUN);
    expect(outcome.pages.length).toBeGreaterThan(0);
    const site = await prisma.cmsSite.findUniqueOrThrow({ where: { id: blockedFixture.siteId } });
    expect(site.status).toBe("PUBLISHED");
  });

  it("fails the publish closed when the configured feed cannot be read", async () => {
    process.env.ABUSE_REPUTATION_FEED_PATH = "/does/not/exist-wt377-feed.json";
    const reviewId = await reviewFor(unavailableFixture);
    const before = await publishedAuditCount(unavailableFixture.organizationId);
    await expect(
      publish(unavailableFixture, reviewId, "idem-unavailable-" + RUN)
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(await publishedAuditCount(unavailableFixture.organizationId)).toBe(before);
  });

  it("records a structural REVIEW verdict but does not block the publish", async () => {
    await writeFeed([]);
    const reviewId = await reviewFor(reviewFixture);
    await publish(reviewFixture, reviewId, "idem-review-" + RUN);
    const verdict = await prisma.cmsAuditTrail.findFirstOrThrow({
      where: {
        organizationId: reviewFixture.organizationId,
        action: CMS_AUDIT_ACTIONS.REPUTATION_VERDICT_RECORDED,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(verdict.changesJson).toMatchObject({ verdict: "REVIEW", trigger: "PUBLISH" });
  });
});
