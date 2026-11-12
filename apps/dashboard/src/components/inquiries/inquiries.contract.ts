import { z } from "zod";

/**
 * Wire contract between the inquiry API routes and the dashboard. The client
 * parses every response here, so a field the API stops sending fails the read
 * instead of rendering an empty cell.
 *
 * It intentionally restates the API schemas instead of importing the server
 * package: the module package carries database and Node-only code that cannot
 * enter a client bundle.
 */

export const inquiryStatusSchema = z.enum(["NEW", "READ", "ARCHIVED", "SPAM"]);

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

export const inquiryContactSchema = z
  .object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  })
  .strict();

export const inquiryDetailSchema = inquirySummarySchema
  .extend({
    payload: z.record(z.unknown()),
    contact: inquiryContactSchema.nullable(),
    contactRedacted: z.boolean(),
  })
  .strict();

export const inquiryListPageSchema = z
  .object({
    items: z.array(inquirySummarySchema),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();

export const inquiryUnreadCountSchema = z
  .object({ count: z.number().int().nonnegative() })
  .strict();

export const inquiryListQuerySchema = z
  .object({
    siteId: z.string().trim().min(1).max(191).optional(),
    status: inquiryStatusSchema.optional(),
    cursor: z.string().trim().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const inquiryStatusUpdateSchema = z
  .object({ status: z.enum(["READ", "ARCHIVED", "SPAM"]) })
  .strict();

export const inquiryExportQuerySchema = z
  .object({
    siteId: z.string().trim().min(1).max(191).optional(),
    status: inquiryStatusSchema.optional(),
  })
  .strict();

export type InquiryStatus = z.infer<typeof inquiryStatusSchema>;
export type InquirySummary = z.infer<typeof inquirySummarySchema>;
export type InquiryDetail = z.infer<typeof inquiryDetailSchema>;
export type InquiryContact = z.infer<typeof inquiryContactSchema>;
export type InquiryListPage = z.infer<typeof inquiryListPageSchema>;
export type InquiryStatusUpdate = z.infer<typeof inquiryStatusUpdateSchema>;
export type InquiryExportQuery = z.infer<typeof inquiryExportQuerySchema>;
