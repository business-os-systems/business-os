import { performance } from "node:perf_hooks";
import { Prisma, prisma, withTenantContext } from "@suite/db";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { ConflictError } from "@suite/core/errors";
import { writeCmsAudit } from "@suite/website-builder/services";
import { PageAstSchema } from "@suite/website-builder/ast";
import { CMS_AUDIT_ACTIONS, CMS_AUDIT_ENTITY_TYPES } from "@suite/website-builder/audit";
import { lockSiteContents, lockSitePages, lockSiteRow } from "./locks.js";
import { syncPageMediaUsages } from "./media-usage-sync.js";
import {
  hashAst,
  isPageChanged,
  publishRecordSchema,
  type PublishRecord,
  type ReviewPageSource,
  type ReviewSnapshot,
} from "./review-state.js";
import {
  loadPages,
  previewRequired,
  requireReviewSnapshot,
  REVIEW_WINDOW_HOURS,
  type ReviewContext,
} from "./review-service.js";
import { prunePageVersions } from "./version-retention.js";
import {
  PublishReputationBlockedError,
  assertPublishReputationClear,
  loadPublishReputationFeed,
  recordPublishReputationRefusal,
} from "./reputation-consult.service.js";
import type { ReputationFeed } from "../abuse/reputation-feed.js";
import {
  DOMAIN_OPERATIONS,
  DOMAIN_OUTCOMES,
  measureDomainOperationSafely,
  recordDomainFailure,
  recordDomainOperation,
} from "../admin/domain-metrics.service.js";

export interface PublishSiteInput {
  readonly organizationId: string;
  readonly siteId: string;
  readonly reviewId: string;
  readonly publisherUserId: string;
  readonly idempotencyKey: string;
  readonly changeNote: string | null;
}

export interface PublishedPage {
  readonly pageId: string;
  readonly versionNumber: number;
  readonly revision: number;
}

export interface PublishOutcome {
  readonly siteId: string;
  readonly reviewId: string;
  readonly reviewerUserId: string;
  readonly publisherUserId: string;
  readonly publishedAt: string;
  readonly pages: PublishedPage[];
  readonly replayed: boolean;
}

function idempotencyConflict(): ConflictError {
  return new ConflictError(
    "This request id was already used for a different release. Use a new Idempotency-Key.",
    { code: PLATFORM_ERROR_CODE.IDEMPOTENCY_CONFLICT }
  );
}

function staleReview(): ConflictError {
  return previewRequired(
    "The site changed after this preview. Open a fresh review before publishing."
  );
}

async function findReplay(
  tx: Prisma.TransactionClient,
  input: PublishSiteInput
): Promise<PublishOutcome | null> {
  const since = new Date(Date.now() - REVIEW_WINDOW_HOURS * 60 * 60 * 1000);
  const rows = await tx.cmsAuditTrail.findMany({
    where: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      action: CMS_AUDIT_ACTIONS.SITE_PUBLISHED,
      createdAt: { gte: since },
    },
    select: { changesJson: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  for (const row of rows) {
    const parsed = publishRecordSchema.safeParse(row.changesJson);
    if (!parsed.success || parsed.data.idempotencyKey !== input.idempotencyKey) {
      continue;
    }
    if (parsed.data.reviewId !== input.reviewId) {
      throw idempotencyConflict();
    }
    return toOutcome(input.siteId, parsed.data, true);
  }
  return null;
}

function toOutcome(siteId: string, record: PublishRecord, replayed: boolean): PublishOutcome {
  return {
    siteId,
    reviewId: record.reviewId,
    reviewerUserId: record.reviewerUserId,
    publisherUserId: record.publisherUserId,
    publishedAt: record.publishedAt,
    pages: [...record.pages],
    replayed,
  };
}

function assertReviewCurrent(
  pages: readonly ReviewPageSource[],
  snapshot: ReviewSnapshot
): void {
  if (pages.length !== snapshot.pages.length) {
    throw staleReview();
  }
  for (const page of pages) {
    const reviewed = snapshot.pages.find((entry) => entry.pageId === page.id);
    const currentHash = hashAst(page.content?.draftAst);
    if (reviewed?.revision !== page.revision || reviewed.draftHash !== currentHash) {
      throw staleReview();
    }
  }
}

async function nextVersionNumber(
  tx: Prisma.TransactionClient,
  page: ReviewPageSource,
  organizationId: string
): Promise<number> {
  const aggregate = await tx.cmsPageVersion.aggregate({
    where: { pageId: page.id, organizationId },
    _max: { versionNumber: true },
  });
  return (aggregate._max.versionNumber ?? 0) + 1;
}

async function markPageLive(
  tx: Prisma.TransactionClient,
  input: PublishSiteInput,
  page: ReviewPageSource,
  publishedAt: Date
): Promise<void> {
  if (page.content === null) {
    throw staleReview();
  }
  const updated = await tx.cmsPage.updateMany({
    where: { id: page.id, organizationId: input.organizationId, revision: page.revision },
    data: { status: "PUBLISHED", revision: { increment: 1 } },
  });
  if (updated.count === 0) {
    throw new ConflictError("The page changed while publishing. Open a fresh review.", {
      code: PLATFORM_ERROR_CODE.VERSION_CONFLICT,
    });
  }
  await tx.cmsPageContent.update({
    where: {
      pageId_organizationId: { pageId: page.id, organizationId: input.organizationId },
    },
    data: { publishedAst: toInputJson(page.content.draftAst), publishedAt },
  });
}

async function snapshotPage(
  tx: Prisma.TransactionClient,
  input: PublishSiteInput,
  page: ReviewPageSource
): Promise<number> {
  if (page.content === null) {
    throw staleReview();
  }
  const versionNumber = await nextVersionNumber(tx, page, input.organizationId);
  await tx.cmsPageVersion.create({
    data: {
      organizationId: input.organizationId,
      pageId: page.id,
      versionNumber,
      label: input.changeNote,
      astSnapshot: toInputJson(page.content.draftAst),
      createdByUserId: input.publisherUserId,
    },
  });
  return versionNumber;
}

async function publishPage(
  tx: Prisma.TransactionClient,
  input: PublishSiteInput,
  page: ReviewPageSource,
  publishedAt: Date
): Promise<PublishedPage> {
  await markPageLive(tx, input, page, publishedAt);
  await promotePageMediaUsages(tx, input, page);
  const versionNumber = await snapshotPage(tx, input, page);
  return { pageId: page.id, versionNumber, revision: page.revision + 1 };
}

/**
 * Publishing is the moment draft references become live references (FR-121).
 * The reconciliation shares the publish transaction, so a release that fails
 * later cannot leave PUBLISHED usages behind.
 */
async function promotePageMediaUsages(
  tx: Prisma.TransactionClient,
  input: PublishSiteInput,
  page: ReviewPageSource
): Promise<void> {
  if (page.content === null) {
    throw staleReview();
  }
  const ast = PageAstSchema.safeParse(page.content.draftAst);
  if (!ast.success) {
    throw staleReview();
  }
  await syncPageMediaUsages({
    tx,
    organizationId: input.organizationId,
    actorUserId: input.publisherUserId,
    pageId: page.id,
    ast: ast.data,
    status: "PUBLISHED",
  });
}

function toInputJson(value: Prisma.JsonValue): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null) {
    return Prisma.JsonNull;
  }
  return value;
}

function buildRecord(
  input: PublishSiteInput,
  reviewerUserId: string,
  publishedAt: Date,
  pages: readonly PublishedPage[]
): PublishRecord {
  return {
    idempotencyKey: input.idempotencyKey,
    reviewId: input.reviewId,
    reviewerUserId,
    publisherUserId: input.publisherUserId,
    publishedAt: publishedAt.toISOString(),
    pages: [...pages],
  };
}

/**
 * Publishing prunes the pages it snapshotted. The prune runs after the release
 * transaction commits and as the schema owner, because the tenant identity may
 * append versions but never delete them. A prune failure is recorded and never
 * unwinds a release that already reached visitors (FR-033, FR-065).
 */
async function pruneReleasedVersions(
  organizationId: string,
  pages: readonly PublishedPage[]
): Promise<void> {
  await measureDomainOperationSafely(
    DOMAIN_OPERATIONS.VERSION_RETENTION,
    { organizationId },
    () =>
      Promise.all(
        pages.map((page) =>
          prunePageVersions({ organizationId, pageId: page.pageId, client: prisma })
        )
      )
  );
}

export async function publishSite(input: PublishSiteInput): Promise<PublishOutcome> {
  const startedAt = performance.now();
  try {
    const feed = await loadPublishReputationFeed();
    const outcome = await releaseSite(input, feed);
    recordDomainOperation({
      operation: DOMAIN_OPERATIONS.PUBLISH,
      outcome: DOMAIN_OUTCOMES.SUCCESS,
      startedAt,
    });
    await pruneReleasedVersions(input.organizationId, outcome.pages);
    return outcome;
  } catch (error: unknown) {
    recordDomainOperation({
      operation: DOMAIN_OPERATIONS.PUBLISH,
      outcome: DOMAIN_OUTCOMES.FAILURE,
      startedAt,
    });
    recordDomainFailure(DOMAIN_OPERATIONS.PUBLISH, error, {
      organizationId: input.organizationId,
      siteId: input.siteId,
    });
    if (error instanceof PublishReputationBlockedError) {
      await recordPublishReputationRefusal(
        {
          organizationId: input.organizationId,
          siteId: input.siteId,
          actorUserId: input.publisherUserId,
        },
        error
      );
    }
    throw error;
  }
}

async function releaseSite(
  input: PublishSiteInput,
  feed: ReputationFeed | null
): Promise<PublishOutcome> {
  return withTenantContext(input.organizationId, async (tx) => {
    const context: ReviewContext = {
      tx,
      organizationId: input.organizationId,
      siteId: input.siteId,
    };
    await lockSiteRow(tx, input);
    const replay = await findReplay(tx, input);
    if (replay !== null) {
      return replay;
    }
    // The verdict commits with the release (FR-134); a replayed request keeps
    // the original outcome because it returns before this check runs.
    await assertPublishReputationClear({
      tx,
      input: {
        organizationId: input.organizationId,
        siteId: input.siteId,
        actorUserId: input.publisherUserId,
      },
      feed,
    });
    const review = await requireReviewSnapshot(context, input.reviewId);
    await lockSitePages(tx, input);
    await lockSiteContents(tx, input);
    const pages = await loadPages(context);
    assertReviewCurrent(pages, review.snapshot);
    const publishedAt = new Date();
    const changed = pages.filter((page) => isPageChanged(page.content));
    const unchanged = pages.filter((page) => !isPageChanged(page.content));
    const published = await publishChangedPages(tx, input, changed, publishedAt);
    // Every live page is reconciled on every release, so a page that predates
    // the media capability still gains its PUBLISHED usage rows.
    await Promise.all(
      unchanged.map((page) => promotePageMediaUsages(tx, input, page))
    );
    if (published.length > 0) {
      await tx.cmsSite.updateMany({
        where: { id: input.siteId, organizationId: input.organizationId },
        data: { status: "PUBLISHED" },
      });
    }
    const record = buildRecord(input, review.snapshot.createdByUserId, publishedAt, published);
    await writeCmsAudit(tx, {
      organizationId: input.organizationId,
      siteId: input.siteId,
      action: CMS_AUDIT_ACTIONS.SITE_PUBLISHED,
      entityType: CMS_AUDIT_ENTITY_TYPES.SITE,
      entityId: input.siteId,
      actorUserId: input.publisherUserId,
      changes: record,
    });
    return toOutcome(input.siteId, record, false);
  });
}

async function publishChangedPages(
  tx: Prisma.TransactionClient,
  input: PublishSiteInput,
  pages: readonly ReviewPageSource[],
  publishedAt: Date
): Promise<PublishedPage[]> {
  return Promise.all(pages.map((page) => publishPage(tx, input, page, publishedAt)));
}

export { staleReview };
