import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { Prisma } from "@suite/db";

/** Review is informational in release one; stale evidence is the only hard stop (FR-091, FR-104). */
export const CMS_REVIEW_STATUS = {
  OPEN: "OPEN",
  READY: "READY",
  STALE: "STALE",
  PUBLISHED: "PUBLISHED",
} as const;

export type CmsReviewStatus = (typeof CMS_REVIEW_STATUS)[keyof typeof CMS_REVIEW_STATUS];

export const REVIEW_ACTION_IDS = {
  PUBLISH: "publish",
} as const;

export type ReviewActionId = (typeof REVIEW_ACTION_IDS)[keyof typeof REVIEW_ACTION_IDS];

export const reviewPageSnapshotSchema = z
  .object({
    pageId: z.string().min(1).max(64),
    title: z.string(),
    path: z.string(),
    orderIndex: z.number().int(),
    revision: z.number().int().positive(),
    draftHash: z.string().min(1).max(128),
    contentUpdatedAt: z.string().datetime().nullable(),
  })
  .strict();

export const reviewSnapshotSchema = z
  .object({
    reviewId: z.string().min(1).max(64),
    siteId: z.string().min(1).max(64),
    createdByUserId: z.string().min(1).max(191),
    createdAt: z.string().datetime(),
    pages: z.array(reviewPageSnapshotSchema),
  })
  .strict();

export type ReviewSnapshot = z.infer<typeof reviewSnapshotSchema>;
export type ReviewPageSnapshot = z.infer<typeof reviewPageSnapshotSchema>;

export const openedPageRecordSchema = z
  .object({
    pageId: z.string().min(1).max(64),
    revision: z.number().int().positive(),
    draftHash: z.string().min(1).max(128),
    openedAt: z.string().datetime(),
  })
  .strict();

export type OpenedPageRecord = z.infer<typeof openedPageRecordSchema>;

export const publishRecordSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(128),
    reviewId: z.string().min(1).max(64),
    reviewerUserId: z.string().min(1).max(191),
    publisherUserId: z.string().min(1).max(191),
    publishedAt: z.string().datetime(),
    pages: z.array(
      z
        .object({
          pageId: z.string().min(1).max(64),
          versionNumber: z.number().int().positive(),
          revision: z.number().int().positive(),
        })
        .strict()
    ),
  })
  .strict();

export type PublishRecord = z.infer<typeof publishRecordSchema>;

export interface ReviewPageSource {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly orderIndex: number;
  readonly status: string;
  readonly revision: number;
  readonly content: {
    readonly draftAst: Prisma.JsonValue;
    readonly publishedAst: Prisma.JsonValue | null;
    readonly updatedAt: Date;
  } | null;
}

export interface ReviewPageView {
  readonly pageId: string;
  readonly title: string;
  readonly path: string;
  readonly orderIndex: number;
  readonly status: string;
  readonly revision: number;
  readonly contentUpdatedAt: string | null;
  readonly changed: boolean;
  readonly reviewed: boolean;
  readonly stale: boolean;
  readonly draftAst: Prisma.JsonObject;
  readonly publishedAst: Prisma.JsonObject | null;
}

export function hashAst(ast: Prisma.JsonValue | null | undefined): string {
  return createHash("sha256").update(JSON.stringify(ast ?? {})).digest("hex");
}

export function isPageChanged(content: ReviewPageSource["content"]): boolean {
  if (content === null) {
    return true;
  }
  if (content.publishedAst === null) {
    return true;
  }
  return !isDeepStrictEqual(content.draftAst, content.publishedAst);
}

export function parseReviewSnapshot(value: Prisma.JsonValue | null): ReviewSnapshot | null {
  const parsed = reviewSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseOpenedPageRecord(value: Prisma.JsonValue | null): OpenedPageRecord | null {
  const parsed = openedPageRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function isSnapshotStale(
  page: ReviewPageSource,
  draftHash: string,
  snapshot: ReviewSnapshot
): boolean {
  const reviewed = snapshot.pages.find((entry) => entry.pageId === page.id);
  return reviewed?.revision !== page.revision || reviewed.draftHash !== draftHash;
}

function isPageReviewed(
  page: ReviewPageSource,
  draftHash: string,
  opened: readonly OpenedPageRecord[]
): boolean {
  return opened.some(
    (entry) => entry.pageId === page.id
      && entry.revision === page.revision
      && entry.draftHash === draftHash
  );
}

export function buildReviewPageView(
  page: ReviewPageSource,
  snapshot: ReviewSnapshot,
  opened: readonly OpenedPageRecord[]
): ReviewPageView {
  const draftHash = hashAst(page.content?.draftAst);
  const isStale = isSnapshotStale(page, draftHash, snapshot);
  const isReviewed = isPageReviewed(page, draftHash, opened);
  return {
    pageId: page.id,
    title: page.title,
    path: page.slug,
    orderIndex: page.orderIndex,
    status: page.status,
    revision: page.revision,
    contentUpdatedAt: page.content?.updatedAt.toISOString() ?? null,
    changed: isPageChanged(page.content),
    reviewed: isReviewed,
    stale: isStale,
    draftAst: asJsonObject(page.content?.draftAst),
    publishedAst: asNullableJsonObject(page.content?.publishedAst),
  };
}

function emptyAst(): Prisma.JsonObject {
  return { version: 1, schemaVersion: "2026-03", sections: [] };
}

export function asJsonObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  if (value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return emptyAst();
}

export function asNullableJsonObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject | null {
  if (value === null || value === undefined) {
    return null;
  }
  return asJsonObject(value);
}

export function resolveReviewStatus(input: {
  readonly pages: readonly ReviewPageView[];
  readonly published: boolean;
  readonly changedPageCount: number;
  readonly reviewedPageCount: number;
}): CmsReviewStatus {
  if (input.published) {
    return CMS_REVIEW_STATUS.PUBLISHED;
  }
  if (input.pages.some((page) => page.stale)) {
    return CMS_REVIEW_STATUS.STALE;
  }
  if (input.changedPageCount > 0 && input.reviewedPageCount === 0) {
    return CMS_REVIEW_STATUS.OPEN;
  }
  return CMS_REVIEW_STATUS.READY;
}

export function countChanged(pages: readonly ReviewPageView[]): number {
  return pages.filter((page) => page.changed).length;
}

export function countReviewed(pages: readonly ReviewPageView[]): number {
  return pages.filter((page) => page.reviewed).length;
}
