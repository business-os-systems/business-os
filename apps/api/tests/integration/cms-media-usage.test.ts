import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  MediaUsageStatus,
  Prisma,
  disconnectTenantRuntimeClient,
  prisma,
} from "@suite/db";
import { ConflictError } from "@suite/core/errors";
import {
  MediaInUseError,
  createMediaService,
  type MediaConfig,
} from "@suite/media";
import { InMemoryStorageAdapter } from "@suite/media/testing";
import type { PageAst } from "@suite/website-builder/ast";
import {
  getPageContent,
  savePageDraft,
} from "../../src/services/cms/page-content.service.js";
import { openReview } from "../../src/services/cms/review-service.js";
import { publishSite } from "../../src/services/cms/publish-service.js";
import { loadPlatformTestEnv } from "../helpers/platform-env.js";

loadPlatformTestEnv();

const enabled = Boolean(
  process.env.DATABASE_URL && process.env.TENANT_DATABASE_URL
);

const APP_ID = "website-builder";
const RESOURCE_TYPE = "Page";
const ACTOR = "usr_wt356_media";
const HERO_BLOCK = "blk_wt356_hero";
const NAV_BLOCK = "blk_wt356_nav";
const CLEANUP_ORGS: string[] = [];
const suffix = randomUUID().slice(0, 8);

const CONFIG: MediaConfig = {
  bucket: "business-os-media",
  region: "auto",
  endpoint: "https://storage.example.com",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  publicBaseUrl: "https://cdn.example.com/media",
  maxBytes: 1_048_576,
  urlTtlSeconds: 900,
  checksumMode: "provider",
};

function checksumFor(label: string): string {
  return Buffer.from(label).toString("hex").padEnd(64, "0").slice(0, 64);
}

function astWith(assetId: string | null): PageAst {
  const blocks = [
    {
      id: HERO_BLOCK,
      type: "hero" as const,
      props: {
        headline: "Harbour views",
        ...(assetId === null
          ? { imageUrl: "https://legacy.example.com/old.png" }
          : { image: { kind: "asset" as const, assetId } }),
      },
    },
    {
      id: NAV_BLOCK,
      type: "navbar" as const,
      props: {
        logoText: "Harbour",
        ...(assetId === null
          ? {}
          : { logo: { kind: "asset" as const, assetId } }),
        items: [],
      },
    },
  ];
  return {
    version: 1,
    schemaVersion: "2026-03",
    sections: [{ id: "sec_wt356", blocks }],
  };
}

async function createOrganization(label: string): Promise<string> {
  const organization = await prisma.organization.create({
    data: {
      name: "WT356 " + label + " " + suffix,
      slug: "wt356-" + label + "-" + suffix,
    },
  });
  CLEANUP_ORGS.push(organization.id);
  return organization.id;
}

async function createAsset(input: {
  readonly organizationId: string;
  readonly label: string;
}): Promise<string> {
  const asset = await prisma.mediaAsset.create({
    data: {
      organizationId: input.organizationId,
      kind: "IMAGE",
      fileName: input.label + ".png",
      mimeType: "image/png",
      sizeBytes: 1024,
      checksum: checksumFor(input.label + suffix),
      width: 800,
      height: 600,
      storageKey: "media/" + input.organizationId + "/2026/11/" + input.label + "-" + suffix + ".png",
      publicUrl:
        "https://cdn.example.com/media/" + input.organizationId + "/" + input.label + ".png",
      createdBy: ACTOR,
    },
  });
  return asset.id;
}

interface PageFixture {
  readonly organizationId: string;
  readonly siteId: string;
  readonly pageId: string;
}

async function createPage(input: {
  readonly organizationId: string;
  readonly ast: PageAst;
}): Promise<PageFixture> {
  const siteId = "site_wt356_" + randomUUID().slice(0, 8);
  const pageId = "page_wt356_" + randomUUID().slice(0, 8);
  await prisma.cmsSite.create({
    data: {
      id: siteId,
      organizationId: input.organizationId,
      title: "WT356 site",
      slug: "wt356-" + siteId,
      status: "DRAFT",
      timezone: "UTC",
    },
  });
  await prisma.cmsPage.create({
    data: {
      id: pageId,
      organizationId: input.organizationId,
      siteId,
      title: "Home",
      slug: "/",
      orderIndex: 0,
      isHomePage: true,
      revision: 1,
      status: "DRAFT",
      content: {
        create: { draftAst: input.ast as unknown as Prisma.InputJsonValue },
      },
    },
  });
  return { organizationId: input.organizationId, siteId, pageId };
}

async function usagesFor(pageId: string) {
  return prisma.mediaUsage.findMany({
    where: { resourceId: pageId, appId: APP_ID, resourceType: RESOURCE_TYPE },
    orderBy: { subKey: "asc" },
  });
}

async function contentFor(pageId: string, organizationId: string) {
  return prisma.cmsPageContent.findFirst({
    where: { pageId, organizationId },
    select: { draftAst: true, publishedAst: true },
  });
}

async function cleanupOrganization(organizationId: string): Promise<void> {
  await prisma.mediaUsage.deleteMany({ where: { organizationId } });
  await prisma.mediaAsset.deleteMany({ where: { organizationId } });
  await prisma.cmsAuditTrail.deleteMany({ where: { organizationId } });
  await prisma.cmsPageVersion.deleteMany({ where: { organizationId } });
  await prisma.cmsPageContent.deleteMany({ where: { organizationId } });
  await prisma.cmsPage.deleteMany({ where: { organizationId } });
  await prisma.cmsSite.deleteMany({ where: { organizationId } });
  await prisma.auditLog.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}

afterAll(async () => {
  if (!enabled) return;
  await Promise.all(CLEANUP_ORGS.map((organizationId) => cleanupOrganization(organizationId)));
  await disconnectTenantRuntimeClient();
});

describe.skipIf(!enabled)("studio media usage: draft", () => {
  it("registers DRAFT usages for a saved draft without downgrading published rows", async () => {
    const organizationId = await createOrganization("draft");
    const assetId = await createAsset({ organizationId, label: "draft" });
    const page = await createPage({ organizationId, ast: astWith(assetId) });

    const saved = await savePageDraft({
      organizationId,
      pageId: page.pageId,
      actorUserId: ACTOR,
      expectedRevision: 1,
      draftAst: astWith(assetId),
    });
    expect(saved.kind).toBe("saved");

    const usages = await usagesFor(page.pageId);
    expect(usages).toHaveLength(2);
    expect(usages.map((usage) => usage.subKey).sort()).toEqual([HERO_BLOCK, NAV_BLOCK]);
    expect(usages.every((usage) => usage.status === MediaUsageStatus.DRAFT)).toBe(true);
    if (saved.kind !== "saved") {
      throw new Error("The draft save was not applied.");
    }
    expect(saved.content.media[assetId]?.url).toContain("cdn.example.com");
  });
});

describe.skipIf(!enabled)("studio media usage: publish", () => {
  it("publishes exactly one PUBLISHED usage per asset, page and block", async () => {
    const organizationId = await createOrganization("publish");
    const assetId = await createAsset({ organizationId, label: "publish" });
    const page = await createPage({ organizationId, ast: astWith(assetId) });

    const review = await openReview({
      organizationId,
      siteId: page.siteId,
      actorUserId: ACTOR,
    });
    const input = {
      organizationId,
      siteId: page.siteId,
      reviewId: review.reviewId,
      publisherUserId: ACTOR,
      idempotencyKey: "idem-wt356-publish-" + suffix,
      changeNote: null,
    };
    await publishSite(input);

    const published = await usagesFor(page.pageId);
    expect(published).toHaveLength(2);
    expect(published.map((usage) => usage.subKey).sort()).toEqual([HERO_BLOCK, NAV_BLOCK]);
    expect(published.every((usage) => usage.status === MediaUsageStatus.PUBLISHED)).toBe(true);

    const replay = await publishSite(input);
    expect(replay.replayed).toBe(true);
    expect(await usagesFor(page.pageId)).toHaveLength(2);
  });

});

describe.skipIf(!enabled)("studio media usage: publish promotion", () => {
  it("promotes draft rows and never downgrades a published reference", async () => {
    const organizationId = await createOrganization("promote");
    const assetId = await createAsset({ organizationId, label: "promote" });
    const page = await createPage({ organizationId, ast: astWith(assetId) });
    const review = await openReview({
      organizationId,
      siteId: page.siteId,
      actorUserId: ACTOR,
    });
    await publishSite({
      organizationId,
      siteId: page.siteId,
      reviewId: review.reviewId,
      publisherUserId: ACTOR,
      idempotencyKey: "idem-wt356-promote-" + suffix,
      changeNote: null,
    });
    const current = await getPageContent({ organizationId, pageId: page.pageId });
    await savePageDraft({
      organizationId,
      pageId: page.pageId,
      actorUserId: ACTOR,
      expectedRevision: current.revision,
      draftAst: astWith(assetId),
    });

    const usages = await usagesFor(page.pageId);
    expect(usages).toHaveLength(2);
    expect(usages.every((usage) => usage.status === MediaUsageStatus.PUBLISHED)).toBe(true);
  });
});

describe.skipIf(!enabled)("studio media usage: publish persistence", () => {
  it("stores asset identity in the published AST and never the resolved URL", async () => {
    const organizationId = await createOrganization("identity");
    const assetId = await createAsset({ organizationId, label: "identity" });
    const page = await createPage({ organizationId, ast: astWith(assetId) });
    const review = await openReview({
      organizationId,
      siteId: page.siteId,
      actorUserId: ACTOR,
    });
    await publishSite({
      organizationId,
      siteId: page.siteId,
      reviewId: review.reviewId,
      publisherUserId: ACTOR,
      idempotencyKey: "idem-wt356-identity-" + suffix,
      changeNote: null,
    });

    const content = await contentFor(page.pageId, organizationId);
    const storedPublished = JSON.stringify(content?.publishedAst);
    expect(storedPublished).toContain('"kind":"asset"');
    expect(storedPublished).toContain(assetId);
    expect(storedPublished).not.toContain("cdn.example.com");
  });

});

describe.skipIf(!enabled)("studio media usage: publish reconciliation", () => {
  it("registers PUBLISHED usages for a live page whose content did not change", async () => {
    const organizationId = await createOrganization("unchanged");
    const assetId = await createAsset({ organizationId, label: "unchanged" });
    const page = await createPage({ organizationId, ast: astWith(assetId) });
    await prisma.cmsPageContent.update({
      where: {
        pageId_organizationId: { pageId: page.pageId, organizationId },
      },
      data: {
        publishedAst: astWith(assetId) as unknown as Prisma.InputJsonValue,
        publishedAt: new Date(),
      },
    });

    const review = await openReview({
      organizationId,
      siteId: page.siteId,
      actorUserId: ACTOR,
    });
    const outcome = await publishSite({
      organizationId,
      siteId: page.siteId,
      reviewId: review.reviewId,
      publisherUserId: ACTOR,
      idempotencyKey: "idem-wt356-unchanged-" + suffix,
      changeNote: null,
    });

    expect(outcome.pages).toHaveLength(0);
    const usages = await usagesFor(page.pageId);
    expect(usages).toHaveLength(2);
    expect(usages.every((usage) => usage.status === MediaUsageStatus.PUBLISHED)).toBe(true);
  });

});

describe.skipIf(!enabled)("studio media usage: publish atomicity", () => {
  it("never promotes usages when a stale review blocks the release", async () => {
    const organizationId = await createOrganization("stale");
    const assetId = await createAsset({ organizationId, label: "stale" });
    const page = await createPage({ organizationId, ast: astWith(assetId) });
    const review = await openReview({
      organizationId,
      siteId: page.siteId,
      actorUserId: ACTOR,
    });
    const current = await getPageContent({ organizationId, pageId: page.pageId });
    await savePageDraft({
      organizationId,
      pageId: page.pageId,
      actorUserId: ACTOR,
      expectedRevision: current.revision,
      draftAst: astWith(assetId),
    });

    await expect(
      publishSite({
        organizationId,
        siteId: page.siteId,
        reviewId: review.reviewId,
        publisherUserId: ACTOR,
        idempotencyKey: "idem-wt356-stale-" + suffix,
        changeNote: null,
      })
    ).rejects.toBeInstanceOf(ConflictError);

    const usages = await usagesFor(page.pageId);
    expect(usages).toHaveLength(2);
    expect(usages.every((usage) => usage.status === MediaUsageStatus.DRAFT)).toBe(true);
  });
});

describe.skipIf(!enabled)("studio media usage: identity folding", () => {
  it("folds a block id longer than the usage column without duplicating the row", async () => {
    const organizationId = await createOrganization("fold");
    const assetId = await createAsset({ organizationId, label: "fold" });
    const longBlockId = "blk_" + "f".repeat(80);
    const ast: PageAst = {
      version: 1,
      schemaVersion: "2026-03",
      sections: [
        {
          id: "sec_wt356_fold",
          blocks: [
            {
              id: longBlockId,
              type: "hero",
              props: {
                headline: "Harbour views",
                image: { kind: "asset", assetId },
              },
            },
          ],
        },
      ],
    };
    const page = await createPage({ organizationId, ast });

    const firstSave = await savePageDraft({
      organizationId,
      pageId: page.pageId,
      actorUserId: ACTOR,
      expectedRevision: 1,
      draftAst: ast,
    });
    expect(firstSave.kind).toBe("saved");
    const replaySave = await savePageDraft({
      organizationId,
      pageId: page.pageId,
      actorUserId: ACTOR,
      expectedRevision: 2,
      draftAst: ast,
    });
    expect(replaySave.kind).toBe("saved");

    const usages = await usagesFor(page.pageId);
    expect(usages).toHaveLength(1);
    expect(usages[0]?.subKey).toHaveLength(64);
    expect(usages[0]?.subKey).toMatch(/^blk_[0-9a-f]{60}$/);
  });
});

describe.skipIf(!enabled)("studio media usage: release", () => {
  it("releases a published usage when the page stops referencing the asset", async () => {
    const organizationId = await createOrganization("release");
    const assetId = await createAsset({ organizationId, label: "release" });
    const page = await createPage({ organizationId, ast: astWith(assetId) });

    const firstReview = await openReview({
      organizationId,
      siteId: page.siteId,
      actorUserId: ACTOR,
    });
    await publishSite({
      organizationId,
      siteId: page.siteId,
      reviewId: firstReview.reviewId,
      publisherUserId: ACTOR,
      idempotencyKey: "idem-wt356-release-1-" + suffix,
      changeNote: null,
    });
    expect(await usagesFor(page.pageId)).toHaveLength(2);

    const current = await getPageContent({ organizationId, pageId: page.pageId });
    await savePageDraft({
      organizationId,
      pageId: page.pageId,
      actorUserId: ACTOR,
      expectedRevision: current.revision,
      draftAst: astWith(null),
    });

    const secondReview = await openReview({
      organizationId,
      siteId: page.siteId,
      actorUserId: ACTOR,
    });
    await publishSite({
      organizationId,
      siteId: page.siteId,
      reviewId: secondReview.reviewId,
      publisherUserId: ACTOR,
      idempotencyKey: "idem-wt356-release-2-" + suffix,
      changeNote: null,
    });

    expect(await usagesFor(page.pageId)).toHaveLength(0);
  });
});

describe.skipIf(!enabled)("studio media usage: deletion guard", () => {
  it("refuses deletion of a studio-referenced asset with its locations", async () => {
    const organizationId = await createOrganization("guard");
    const assetId = await createAsset({ organizationId, label: "guard" });
    const page = await createPage({ organizationId, ast: astWith(assetId) });
    const review = await openReview({
      organizationId,
      siteId: page.siteId,
      actorUserId: ACTOR,
    });
    await publishSite({
      organizationId,
      siteId: page.siteId,
      reviewId: review.reviewId,
      publisherUserId: ACTOR,
      idempotencyKey: "idem-wt356-guard-" + suffix,
      changeNote: null,
    });

    const service = createMediaService({
      storage: new InMemoryStorageAdapter(),
      config: CONFIG,
    });
    try {
      await service.deleteAsset({ organizationId, userId: ACTOR }, assetId);
      throw new Error("Expected MEDIA_IN_USE");
    } catch (error) {
      expect(error).toBeInstanceOf(MediaInUseError);
      if (!(error instanceof MediaInUseError)) {
        throw error;
      }
      expect(error.status).toBe(409);
      expect(error.references).toHaveLength(2);
      expect(error.references.map((reference) => reference.resourceId)).toEqual([
        page.pageId,
        page.pageId,
      ]);
      const invalidParams = error.invalidParams ?? [];
      expect(invalidParams.map((param) => param.name)).toEqual([
        "website-builder:Page",
        "website-builder:Page",
      ]);
      expect(invalidParams.map((param) => param.reason).sort()).toEqual([
        page.pageId + "#" + HERO_BLOCK,
        page.pageId + "#" + NAV_BLOCK,
      ]);
    }
  });
});

describe.skipIf(!enabled)("studio media usage: tenant boundary", () => {
  it("never registers a usage for another tenant's asset", async () => {
    const ownerOrganizationId = await createOrganization("owner");
    const foreignAssetId = await createAsset({
      organizationId: ownerOrganizationId,
      label: "foreign",
    });
    const organizationId = await createOrganization("borrower");
    const page = await createPage({ organizationId, ast: astWith(foreignAssetId) });

    const saved = await savePageDraft({
      organizationId,
      pageId: page.pageId,
      actorUserId: ACTOR,
      expectedRevision: 1,
      draftAst: astWith(foreignAssetId),
    });
    expect(saved.kind).toBe("saved");
    expect(await usagesFor(page.pageId)).toHaveLength(0);
    if (saved.kind === "saved") {
      expect(saved.content.media).toEqual({});
    }
  });
});
