import { z } from "zod";
import {
  TENANT_LIFECYCLE_REASON_MAX_LENGTH,
  TENANT_LIFECYCLE_REASON_MIN_LENGTH,
} from "@suite/core";
import { CMS_SITE_STATUSES, SITE_LIST_LIMIT } from "./site-takedown.contract.js";

/**
 * Site deletion lifecycle contract (FR-097, FR-099). An inactive site is
 * flagged, never deleted, and removal needs an explicit human confirmation
 * naming the site. The vocabulary mirrors CmsSiteStatus at the API boundary.
 */
export const SITE_DELETION_FLAG_AFTER_DAYS = 365;

export const siteDeletionParamsSchema = z
  .object({
    orgId: z.string().trim().min(1).max(128),
    siteId: z.string().trim().min(1).max(64),
  })
  .strict();

export const siteDeletionConfirmationBodySchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(TENANT_LIFECYCLE_REASON_MIN_LENGTH)
      .max(TENANT_LIFECYCLE_REASON_MAX_LENGTH),
    expectedStatus: z.enum(CMS_SITE_STATUSES),
    confirmSlug: z.string().trim().min(1).max(191),
  })
  .strict();

export const deletionFlaggedSiteSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    status: z.enum(CMS_SITE_STATUSES),
    deletionFlaggedAt: z.string().datetime(),
  })
  .strict();

export const deletionFlaggedSiteListSchema = z
  .object({ items: z.array(deletionFlaggedSiteSchema).max(SITE_LIST_LIMIT) })
  .strict();

export const siteDeletionResultSchema = z
  .object({
    siteId: z.string(),
    status: z.literal("ARCHIVED"),
    confirmedAt: z.string().datetime(),
    purgedPages: z.number().int().nonnegative(),
    purgedInquiries: z.number().int().nonnegative(),
  })
  .strict();

export type SiteDeletionConfirmationBody = z.infer<typeof siteDeletionConfirmationBodySchema>;
export type DeletionFlaggedSite = z.infer<typeof deletionFlaggedSiteSchema>;
export type SiteDeletionResult = z.infer<typeof siteDeletionResultSchema>;
