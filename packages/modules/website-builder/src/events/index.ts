import { z } from "zod";

/**
 * Domain Event Types for Website Builder & Headless CMS
 */
export const WebsiteBuilderEventType = {
  PAGE_PUBLISHED: "cms.page.published",
  PAGE_UNPUBLISHED: "cms.page.unpublished",
  FORM_SUBMITTED: "cms.form.submitted",
  ASSET_UPLOADED: "cms.asset.uploaded",
} as const;

export type WebsiteBuilderEventType =
  (typeof WebsiteBuilderEventType)[keyof typeof WebsiteBuilderEventType];

export const PagePublishedEventPayloadSchema = z.object({
  tenantId: z.string().uuid(),
  pageId: z.string().uuid(),
  slug: z.string(),
  version: z.number().int().positive(),
  publishedAt: z.string().datetime(),
});

export type PagePublishedEventPayload = z.infer<
  typeof PagePublishedEventPayloadSchema
>;
export * from "./catalog.js";
export * from "./outbox-writer.js";

