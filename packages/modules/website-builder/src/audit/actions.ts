/**
 * Canonical audit action and entity vocabulary for the CMS application plane.
 *
 * CmsAuditTrail.action is a free-text column in PostgreSQL, so the values that
 * identify a mutation live here and every writer imports them (CT-6). The
 * registry is a closed tuple; a new audited mutation extends it explicitly.
 */
export const CMS_AUDIT_ACTIONS = {
  SITE_CREATED: "SITE_CREATED",
  PAGE_CREATED: "PAGE_CREATED",
  PAGE_RENAMED: "PAGE_RENAMED",
  PAGE_MOVED: "PAGE_MOVED",
  PAGE_DELETED: "PAGE_DELETED",
  INQUIRY_PII_VIEWED: "INQUIRY_PII_VIEWED",
  INQUIRY_STATUS_CHANGED: "INQUIRY_STATUS_CHANGED",
  INQUIRY_ERASED: "INQUIRY_ERASED",
  SITE_SUSPENDED: "SITE_SUSPENDED",
  SITE_RESTORED: "SITE_RESTORED",
  REPUTATION_VERDICT_RECORDED: "REPUTATION_VERDICT_RECORDED",
  REVIEW_OPENED: "REVIEW_OPENED",
  REVIEW_PAGE_OPENED: "REVIEW_PAGE_OPENED",
  SITE_PUBLISHED: "SITE_PUBLISHED",
  VERSION_RESTORED: "VERSION_RESTORED",
  APPEARANCE_UPDATED: "APPEARANCE_UPDATED",
  APPEARANCE_THEME_SELECTED: "APPEARANCE_THEME_SELECTED",
  APPEARANCE_RESET: "APPEARANCE_RESET",
  APPEARANCE_PUBLISHED: "APPEARANCE_PUBLISHED",
  PAGE_CONTENT_SAVED: "PAGE_CONTENT_SAVED",
  PAGE_CONTENT_CONFLICT_RETAINED: "PAGE_CONTENT_CONFLICT_RETAINED",
} as const;

export type CmsAuditAction = (typeof CMS_AUDIT_ACTIONS)[keyof typeof CMS_AUDIT_ACTIONS];

export const CMS_AUDIT_ENTITY_TYPES = {
  SITE: "CmsSite",
  PAGE: "CmsPage",
  INQUIRY: "CmsInquiry",
  REVIEW_SESSION: "CmsReviewSession",
  PAGE_VERSION: "CmsPageVersion",
  SITE_APPEARANCE: "CmsSiteAppearance",
} as const;

export type CmsAuditEntityType =
  (typeof CMS_AUDIT_ENTITY_TYPES)[keyof typeof CMS_AUDIT_ENTITY_TYPES];

/** Version history label used when a losing draft is retained on a conflict. */
export const CMS_CONFLICT_DRAFT_LABEL = "Conflict draft (retained)";
