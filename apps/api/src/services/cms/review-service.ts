import { randomUUID } from "node:crypto";
import { Prisma, withTenantContext } from "@suite/db";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { ConflictError, NotFoundError } from "@suite/core/errors";
import { resolveMediaAssets } from "@suite/media";
import {
  collectMediaAssetIds,
  PageAstSchema,
  type MediaAssetMap,
} from "@suite/website-builder/ast";
import { writeCmsAudit } from "@suite/website-builder/services";
import { CMS_AUDIT_ACTIONS, CMS_AUDIT_ENTITY_TYPES } from "@suite/website-builder/audit";
import {
  buildReviewPageView,
  countChanged,
  countReviewed,
  hashAst,
  parseOpenedPageRecord,
  parseReviewSnapshot,
  publishRecordSchema,
  resolveReviewStatus,
  type CmsReviewStatus,
  type ReviewPageSource,
  type ReviewPageView,
  type ReviewSnapshot,
} from "./review-state.js";

const REVIEW_WINDOW_HOURS = 24;

export interface ReviewSummary {
  readonly reviewId: string;
  readonly siteId: string;
  readonly status: CmsReviewStatus;
  readonly createdAt: string;
  readonly reviewerUserId: string;
  readonly publishedAt: string | null;
  readonly changedPageCount: number;
  readonly reviewedPageCount: number;
  readonly pages: ReviewPageView[];
  /** Server-resolved asset URLs for both drafts and live ASTs. */
  readonly media: MediaAssetMap;
}

interface ReviewContext {
  readonly tx: Prisma.TransactionClient;
  readonly organizationId: string;
  readonly siteId: string;
}

function previewRequired(detail: string): ConflictError {
  return new ConflictError(detail, { code: PLATFORM_ERROR_CODE.PREVIEW_REQUIRED });
}

async function requireSite(context: ReviewContext): Promise<void> {
  const site = await context.tx.cmsSite.findFirst({
    where: { id: context.siteId, organizationId: context.organizationId },
    select: { id: true },
  });
  if (site === null) {
    throw new NotFoundError("The requested site was not found.", {
      code: PLATFORM_ERROR_CODE.NOT_FOUND,
    });
  }
}

async function loadPages(context: ReviewContext): Promise<ReviewPageSource[]> {
  return context.tx.cmsPage.findMany({
    where: { organizationId: context.organizationId, siteId: context.siteId },
    include: { content: true },
    orderBy: [{ orderIndex: "asc" }, { id: "asc" }],
  });
}

async function loadReviewRow(
  context: ReviewContext,
  reviewId: string
): Promise<{ readonly changesJson: Prisma.JsonValue | null; readonly actorUserId: string; readonly createdAt: Date } | null> {
  return context.tx.cmsAuditTrail.findFirst({
    where: {
      organizationId: context.organizationId,
      siteId: context.siteId,
      action: CMS_AUDIT_ACTIONS.REVIEW_OPENED,
      entityType: CMS_AUDIT_ENTITY_TYPES.REVIEW_SESSION,
      entityId: reviewId,
    },
    select: { changesJson: true, actorUserId: true, createdAt: true },
  });
}

async function loadReviewSnapshotRow(
  context: ReviewContext,
  reviewId: string
): Promise<{ readonly snapshot: ReviewSnapshot; readonly createdAt: Date } | null> {
  const row = await loadReviewRow(context, reviewId);
  if (row === null) {
    return null;
  }
  const snapshot = parseReviewSnapshot(row.changesJson);
  if (snapshot === null) {
    return null;
  }
  return { snapshot, createdAt: row.createdAt };
}

async function requireReviewSnapshot(
  context: ReviewContext,
  reviewId: string
): Promise<{ readonly snapshot: ReviewSnapshot; readonly createdAt: Date }> {
  const review = await loadReviewSnapshotRow(context, reviewId);
  if (review === null) {
    throw previewRequired("Open a fresh review before publishing this site.");
  }
  return review;
}

async function requireReviewForRead(
  context: ReviewContext,
  reviewId: string
): Promise<{ readonly snapshot: ReviewSnapshot; readonly createdAt: Date }> {
  const review = await loadReviewSnapshotRow(context, reviewId);
  if (review === null) {
    throw new NotFoundError("The requested review was not found.", {
      code: PLATFORM_ERROR_CODE.NOT_FOUND,
    });
  }
  return review;
}

async function loadOpenedRecords(context: ReviewContext, reviewId: string) {
  const rows = await context.tx.cmsAuditTrail.findMany({
    where: {
      organizationId: context.organizationId,
      siteId: context.siteId,
      action: CMS_AUDIT_ACTIONS.REVIEW_PAGE_OPENED,
      entityType: CMS_AUDIT_ENTITY_TYPES.REVIEW_SESSION,
      entityId: reviewId,
    },
    select: { changesJson: true },
  });
  return rows
    .map((row) => parseOpenedPageRecord(row.changesJson))
    .filter((record): record is NonNullable<typeof record> => record !== null);
}

async function findPublishedAt(
  context: ReviewContext,
  reviewId: string
): Promise<string | null> {
  const rows = await context.tx.cmsAuditTrail.findMany({
    where: {
      organizationId: context.organizationId,
      siteId: context.siteId,
      action: CMS_AUDIT_ACTIONS.SITE_PUBLISHED,
    },
    select: { changesJson: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  for (const row of rows) {
    const parsed = publishRecordSchema.safeParse(row.changesJson);
    if (parsed.success && parsed.data.reviewId === reviewId) {
      return parsed.data.publishedAt;
    }
  }
  return null;
}

function buildSnapshot(input: {
  readonly reviewId: string;
  readonly siteId: string;
  readonly actorUserId: string;
  readonly createdAt: Date;
  readonly pages: readonly ReviewPageSource[];
}): ReviewSnapshot {
  return {
    reviewId: input.reviewId,
    siteId: input.siteId,
    createdByUserId: input.actorUserId,
    createdAt: input.createdAt.toISOString(),
    pages: input.pages.map((page) => ({
      pageId: page.id,
      title: page.title,
      path: page.slug,
      orderIndex: page.orderIndex,
      revision: page.revision,
      draftHash: hashAst(page.content?.draftAst),
      contentUpdatedAt: page.content?.updatedAt.toISOString() ?? null,
    })),
  };
}

function assetIdsFromViews(views: readonly ReviewPageView[]): string[] {
  const ids = new Set<string>();
  for (const view of views) {
    for (const raw of [view.draftAst, view.publishedAst]) {
      const parsed = PageAstSchema.safeParse(raw);
      if (!parsed.success) {
        continue;
      }
      for (const assetId of collectMediaAssetIds(parsed.data)) {
        ids.add(assetId);
      }
    }
  }
  return [...ids];
}

async function resolveReviewMedia(
  tx: Prisma.TransactionClient,
  organizationId: string,
  views: readonly ReviewPageView[]
): Promise<MediaAssetMap> {
  return resolveMediaAssets(tx, organizationId, assetIdsFromViews(views));
}

function summarize(input: {
  readonly reviewId: string;
  readonly siteId: string;
  readonly createdAt: string;
  readonly reviewerUserId: string;
  readonly publishedAt: string | null;
  readonly pages: readonly ReviewPageView[];
  readonly media: MediaAssetMap;
}): ReviewSummary {
  const changedPageCount = countChanged(input.pages);
  const reviewedPageCount = countReviewed(input.pages);
  return {
    reviewId: input.reviewId,
    siteId: input.siteId,
    createdAt: input.createdAt,
    reviewerUserId: input.reviewerUserId,
    publishedAt: input.publishedAt,
    pages: [...input.pages],
    media: input.media,
    status: resolveReviewStatus({
      pages: input.pages,
      published: input.publishedAt !== null,
      changedPageCount,
      reviewedPageCount,
    }),
    changedPageCount,
    reviewedPageCount,
  };
}

export async function openReview(input: {
  readonly organizationId: string;
  readonly siteId: string;
  readonly actorUserId: string;
}): Promise<ReviewSummary> {
  return withTenantContext(input.organizationId, async (tx) => {
    const context: ReviewContext = {
      tx,
      organizationId: input.organizationId,
      siteId: input.siteId,
    };
    await requireSite(context);
    const pages = await loadPages(context);
    const reviewId = randomUUID();
    const createdAt = new Date();
    const snapshot = buildSnapshot({ ...input, reviewId, createdAt, pages });
    await writeCmsAudit(tx, {
      organizationId: input.organizationId,
      siteId: input.siteId,
      action: CMS_AUDIT_ACTIONS.REVIEW_OPENED,
      entityType: CMS_AUDIT_ENTITY_TYPES.REVIEW_SESSION,
      entityId: reviewId,
      actorUserId: input.actorUserId,
      changes: snapshot,
    });
    const views = pages.map((page) => buildReviewPageView(page, snapshot, []));
    return summarize({
      reviewId,
      siteId: input.siteId,
      createdAt: createdAt.toISOString(),
      reviewerUserId: input.actorUserId,
      publishedAt: null,
      pages: views,
      media: await resolveReviewMedia(tx, input.organizationId, views),
    });
  });
}

export async function getReview(input: {
  readonly organizationId: string;
  readonly siteId: string;
  readonly reviewId: string;
}): Promise<ReviewSummary> {
  return withTenantContext(input.organizationId, async (tx) => {
    const context: ReviewContext = {
      tx,
      organizationId: input.organizationId,
      siteId: input.siteId,
    };
    const review = await requireReviewForRead(context, input.reviewId);
    const pages = await loadPages(context);
    const opened = await loadOpenedRecords(context, input.reviewId);
    const publishedAt = await findPublishedAt(context, input.reviewId);
    const views = pages.map((page) => buildReviewPageView(page, review.snapshot, opened));
    return summarize({
      reviewId: input.reviewId,
      siteId: input.siteId,
      createdAt: review.createdAt.toISOString(),
      reviewerUserId: review.snapshot.createdByUserId,
      publishedAt,
      pages: views,
      media: await resolveReviewMedia(tx, input.organizationId, views),
    });
  });
}

export async function markReviewPageOpened(input: {
  readonly organizationId: string;
  readonly siteId: string;
  readonly reviewId: string;
  readonly pageId: string;
  readonly actorUserId: string;
}): Promise<{ readonly pageId: string; readonly revision: number; readonly reviewed: boolean; readonly stale: boolean }> {
  return withTenantContext(input.organizationId, async (tx) => {
    const context: ReviewContext = {
      tx,
      organizationId: input.organizationId,
      siteId: input.siteId,
    };
    const review = await requireReviewForRead(context, input.reviewId);
    const page = await tx.cmsPage.findFirst({
      where: { id: input.pageId, organizationId: input.organizationId, siteId: input.siteId },
      include: { content: true },
    });
    if (page === null) {
      throw new NotFoundError("The requested page was not found.", {
        code: PLATFORM_ERROR_CODE.NOT_FOUND,
      });
    }
    const view = buildReviewPageView(page, review.snapshot, []);
    await writeCmsAudit(tx, {
      organizationId: input.organizationId,
      siteId: input.siteId,
      action: CMS_AUDIT_ACTIONS.REVIEW_PAGE_OPENED,
      entityType: CMS_AUDIT_ENTITY_TYPES.REVIEW_SESSION,
      entityId: input.reviewId,
      actorUserId: input.actorUserId,
      changes: {
        pageId: page.id,
        revision: page.revision,
        draftHash: hashAst(page.content?.draftAst),
        openedAt: new Date().toISOString(),
      },
    });
    return { pageId: page.id, revision: page.revision, reviewed: !view.stale, stale: view.stale };
  });
}

export type { ReviewPageView };
export { previewRequired, requireReviewSnapshot, loadPages, type ReviewContext };
export { REVIEW_WINDOW_HOURS };
