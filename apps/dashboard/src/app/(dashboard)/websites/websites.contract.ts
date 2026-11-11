import { z } from "zod";

/**
 * Wire contract between the tenant-scoped sites read and the overview. The API
 * parses its query here and the client parses its response here, so neither
 * side can drift from the other.
 */

export const websiteSiteStatusSchema = z.enum([
  "DRAFT",
  "PUBLISHED",
  "MAINTENANCE",
  "SUSPENDED",
  "ARCHIVED",
]);

export const websiteSiteSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  status: websiteSiteStatusSchema,
  timezone: z.string().min(1),
  primaryDomain: z.string().min(1).nullable(),
  pageCount: z.number().int().nonnegative(),
  homePageId: z.string().min(1).nullable(),
  updatedAt: z.string().datetime(),
});

export const websiteSitesPageSchema = z.object({
  sites: z.array(websiteSiteSummarySchema),
  nextCursor: z.string().min(1).nullable(),
});

export const websiteSitesQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

export type WebsiteSiteStatus = z.infer<typeof websiteSiteStatusSchema>;
export type WebsiteSiteSummary = z.infer<typeof websiteSiteSummarySchema>;
export type WebsiteSitesPage = z.infer<typeof websiteSitesPageSchema>;
export type WebsiteSitesQuery = z.infer<typeof websiteSitesQuerySchema>;
