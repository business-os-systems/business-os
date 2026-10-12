import { z } from "zod";

/**
 * Event Names Catalog for App 01: Website Builder & Headless CMS
 */
export const CmsEvents = {
  PAGE_PUBLISHED: "cms.page.published",
  PAGE_UNPUBLISHED: "cms.page.unpublished",
  FORM_SUBMITTED: "cms.form.submitted",
  DOMAIN_VERIFIED: "cms.domain.verified",
} as const;

export type CmsEventName = (typeof CmsEvents)[keyof typeof CmsEvents];

/**
 * Standard CloudEvents-compliant Envelope Schema
 */
export const CmsEventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  source: z.literal("app.website-builder"),
  organizationId: z.string(),
  siteId: z.string(),
  schemaVersion: z.number().int().positive(),
  data: z.record(z.unknown()),
  timestamp: z.string().datetime(),
});

export type CmsEventEnvelope = z.infer<typeof CmsEventEnvelopeSchema>;

/**
 * Schema: cms.page.published
 */
export const PagePublishedEventDataSchema = z.object({
  pageId: z.string(),
  slug: z.string(),
  title: z.string(),
  revision: z.number().int().positive(),
  publishedAt: z.string().datetime(),
  surrogateKey: z.string(),
});

export type PagePublishedEventData = z.infer<
  typeof PagePublishedEventDataSchema
>;

/**
 * Schema: cms.page.unpublished
 */
export const PageUnpublishedEventDataSchema = z.object({
  pageId: z.string(),
  slug: z.string(),
  unpublishedAt: z.string().datetime(),
});

export type PageUnpublishedEventData = z.infer<
  typeof PageUnpublishedEventDataSchema
>;

/**
 * Schema: cms.form.submitted
 */
export const FormSubmittedEventDataSchema = z.object({
  submissionId: z.string(),
  blockId: z.string(),
  idempotencyKey: z.string(),
  submitterEmailHash: z.string().optional(),
  attachmentCount: z.number().int().nonnegative(),
  submittedAt: z.string().datetime(),
});

export type FormSubmittedEventData = z.infer<
  typeof FormSubmittedEventDataSchema
>;

/**
 * Schema: cms.domain.verified
 */
export const DomainVerifiedEventDataSchema = z.object({
  domainId: z.string(),
  hostname: z.string(),
  verifiedAt: z.string().datetime(),
});

export type DomainVerifiedEventData = z.infer<
  typeof DomainVerifiedEventDataSchema
>;
