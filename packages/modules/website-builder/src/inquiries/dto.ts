import { z } from "zod";
import {
  extractContactFields,
  inquiryPreview,
  redactContactFields,
  type InquiryContactFields,
} from "./policy.js";
import type { InquiryRecord } from "./store.js";

/** Wire contracts shared by the API routes and the dashboard client. */

export const inquiryStatusSchema = z.enum(["NEW", "READ", "ARCHIVED", "SPAM"]);

export const inquiryContactSchema = z
  .object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  })
  .strict();

export const inquirySummarySchema = z
  .object({
    id: z.string().min(1),
    siteId: z.string().min(1),
    pageId: z.string().min(1).nullable(),
    blockId: z.string().min(1),
    status: inquiryStatusSchema,
    preview: z.string(),
    submittedAt: z.string().datetime(),
    readAt: z.string().datetime().nullable(),
    archivedAt: z.string().datetime().nullable(),
    retentionExpiresAt: z.string().datetime(),
  })
  .strict();

export const inquiryListPageSchema = z
  .object({
    items: z.array(inquirySummarySchema),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();

export const inquiryDetailSchema = inquirySummarySchema
  .extend({
    payload: z.record(z.unknown()),
    contact: inquiryContactSchema.nullable(),
    contactRedacted: z.boolean(),
  })
  .strict();

export const inquiryUnreadCountSchema = z.object({ count: z.number().int().nonnegative() }).strict();

export const inquiryStatusUpdateSchema = z
  .object({ status: z.enum(["READ", "ARCHIVED", "SPAM"]) })
  .strict();

export type InquirySummary = z.infer<typeof inquirySummarySchema>;
export type InquiryDetail = z.infer<typeof inquiryDetailSchema>;
export type InquiryListPage = z.infer<typeof inquiryListPageSchema>;
export type InquiryContact = z.infer<typeof inquiryContactSchema>;

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function toInquirySummary(record: InquiryRecord): InquirySummary {
  return {
    id: record.id,
    siteId: record.siteId,
    pageId: record.pageId,
    blockId: record.blockId,
    status: record.status,
    preview: inquiryPreview(record.payload),
    submittedAt: record.createdAt.toISOString(),
    readAt: isoOrNull(record.readAt),
    archivedAt: isoOrNull(record.archivedAt),
    retentionExpiresAt: record.retentionExpiresAt.toISOString(),
  };
}

export function toInquiryDetail(
  record: InquiryRecord,
  contact: InquiryContactFields | null
): InquiryDetail {
  return {
    ...toInquirySummary(record),
    payload: contact === null ? redactContactFields(record.payload) : record.payload,
    contact,
    contactRedacted: contact === null && Object.values(extractContactFields(record.payload)).some(
      (value) => value !== null
    ),
  };
}
