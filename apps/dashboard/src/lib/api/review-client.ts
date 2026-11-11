import { z } from "zod";
import { MediaAssetMapSchema } from "@suite/website-builder/ast";
import { cmsEnvelopeSchema, requestCmsJson } from "./cms-http";

const reviewPageSchema = z.object({
  pageId: z.string(),
  title: z.string(),
  path: z.string(),
  orderIndex: z.number().int(),
  status: z.string(),
  revision: z.number().int(),
  contentUpdatedAt: z.string().nullable(),
  changed: z.boolean(),
  reviewed: z.boolean(),
  stale: z.boolean(),
  draftAst: z.unknown(),
  publishedAst: z.unknown().nullable(),
});

const reviewActionSchema = z.object({ id: z.string(), label: z.string() });

const reviewSchema = z.object({
  reviewId: z.string(),
  siteId: z.string(),
  status: z.enum(["OPEN", "READY", "STALE", "PUBLISHED"]),
  createdAt: z.string(),
  reviewerUserId: z.string(),
  publishedAt: z.string().nullable(),
  changedPageCount: z.number().int(),
  reviewedPageCount: z.number().int(),
  pages: z.array(reviewPageSchema),
  media: MediaAssetMapSchema,
});

const reviewResultSchema = cmsEnvelopeSchema(
  z.object({
    review: reviewSchema,
    canPublish: z.boolean(),
    actions: z.array(reviewActionSchema),
  })
);

const openedResultSchema = cmsEnvelopeSchema(
  z.object({
    pageId: z.string(),
    revision: z.number().int(),
    reviewed: z.boolean(),
    stale: z.boolean(),
  })
);

const publishResultSchema = cmsEnvelopeSchema(
  z.object({
    siteId: z.string(),
    reviewId: z.string(),
    reviewerUserId: z.string(),
    publisherUserId: z.string(),
    publishedAt: z.string(),
    pages: z.array(
      z.object({
        pageId: z.string(),
        versionNumber: z.number().int(),
        revision: z.number().int(),
      })
    ),
    replayed: z.boolean(),
  })
);

export type ReviewPageDto = z.infer<typeof reviewPageSchema>;
export type ReviewActionDto = z.infer<typeof reviewActionSchema>;
export type ReviewDto = z.infer<typeof reviewSchema>;
export type ReviewResult = z.infer<typeof reviewResultSchema>["data"];
export type PublishResult = z.infer<typeof publishResultSchema>["data"];

const CMS_BASE = "/api/v1/cms";

export async function openReview(siteId: string): Promise<ReviewResult> {
  const path = CMS_BASE + "/sites/" + encodeURIComponent(siteId) + "/review";
  const response = await requestCmsJson(path, reviewResultSchema, { method: "POST" });
  return response.data;
}

export async function getReview(siteId: string, reviewId: string): Promise<ReviewResult> {
  const path =
    CMS_BASE +
    "/sites/" +
    encodeURIComponent(siteId) +
    "/review/" +
    encodeURIComponent(reviewId);
  const response = await requestCmsJson(path, reviewResultSchema, { method: "GET" });
  return response.data;
}

export async function markReviewPageOpened(
  siteId: string,
  reviewId: string,
  pageId: string
): Promise<{ pageId: string; revision: number; reviewed: boolean; stale: boolean }> {
  const path =
    CMS_BASE +
    "/sites/" +
    encodeURIComponent(siteId) +
    "/review/" +
    encodeURIComponent(reviewId) +
    "/pages/" +
    encodeURIComponent(pageId) +
    "/opened";
  const response = await requestCmsJson(path, openedResultSchema, { method: "POST" });
  return response.data;
}

export async function publishReview(
  siteId: string,
  input: { reviewId: string; changeNote?: string },
  idempotencyKey: string
): Promise<PublishResult> {
  const path = CMS_BASE + "/sites/" + encodeURIComponent(siteId) + "/publish";
  const response = await requestCmsJson(path, publishResultSchema, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
  return response.data;
}
