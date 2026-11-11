import { z } from "zod";
import {
  TENANT_LIFECYCLE_REASON_MAX_LENGTH,
  TENANT_LIFECYCLE_REASON_MIN_LENGTH,
} from "@suite/core";

/**
 * Operator takedown contract (FR-132, T122). The vocabulary mirrors
 * CmsSiteStatus; the API keeps it local because a UI/API boundary must not
 * import @suite/db.
 */
export const CMS_SITE_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "MAINTENANCE",
  "SUSPENDED",
  "ARCHIVED",
] as const;

export type CmsSiteStatus = (typeof CMS_SITE_STATUSES)[number];

export const SITE_TAKEDOWN_ACTIONS = {
  SUSPEND: "SUSPEND",
  RESTORE: "RESTORE",
} as const;

export type SiteTakedownAction =
  (typeof SITE_TAKEDOWN_ACTIONS)[keyof typeof SITE_TAKEDOWN_ACTIONS];

export const SITE_LIST_LIMIT = 100;

export const siteTakedownParamsSchema = z
  .object({
    orgId: z.string().trim().min(1).max(128),
    siteId: z.string().trim().min(1).max(64),
  })
  .strict();

export const siteTakedownBodySchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(TENANT_LIFECYCLE_REASON_MIN_LENGTH)
      .max(TENANT_LIFECYCLE_REASON_MAX_LENGTH),
    expectedStatus: z.enum(CMS_SITE_STATUSES),
  })
  .strict();

export const tenantSiteSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    status: z.enum(CMS_SITE_STATUSES),
    hostnames: z.array(z.string()),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const tenantSiteListSchema = z
  .object({ items: z.array(tenantSiteSchema).max(SITE_LIST_LIMIT) })
  .strict();

export const siteTakedownResultSchema = z
  .object({
    siteId: z.string(),
    fromStatus: z.enum(CMS_SITE_STATUSES),
    toStatus: z.enum(CMS_SITE_STATUSES),
    occurredAt: z.string().datetime(),
    hostnames: z.array(z.string()),
  })
  .strict();

export type SiteTakedownBody = z.infer<typeof siteTakedownBodySchema>;
export type TenantSite = z.infer<typeof tenantSiteSchema>;
export type TenantSiteList = z.infer<typeof tenantSiteListSchema>;
export type SiteTakedownResult = z.infer<typeof siteTakedownResultSchema>;
