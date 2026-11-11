import type {
  MediaAssetKind,
  MediaAssetStatus,
  MediaUsageStatus,
} from "@suite/db";

/**
 * Shared media library vocabulary (FR-050 to FR-052, FR-119 to FR-122).
 * The literals are checked against the Prisma enums through `satisfies`, so a
 * renamed or removed schema member breaks the compiler instead of drifting.
 * The import stays type-only: this module is reachable from the React subpath,
 * which must never pull the database client into a browser bundle.
 */
export const MEDIA_ASSET_KINDS = [
  "IMAGE",
] as const satisfies readonly MediaAssetKind[];

export const MEDIA_ASSET_STATUSES = [
  "ACTIVE",
  "ARCHIVED",
] as const satisfies readonly MediaAssetStatus[];

export const MEDIA_USAGE_STATUSES = [
  "DRAFT",
  "PUBLISHED",
] as const satisfies readonly MediaUsageStatus[];

/**
 * Declared upload types. SVG is deliberately excluded: it is an active content
 * type and is served from the asset origin.
 */
export const MEDIA_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export type MediaAllowedMimeType = (typeof MEDIA_ALLOWED_MIME_TYPES)[number];

export const MEDIA_LIMITS = {
  DEFAULT_PAGE_SIZE: 24,
  MAX_PAGE_SIZE: 100,
  MAX_FILE_NAME_LENGTH: 255,
  MAX_SEARCH_LENGTH: 120,
  MAX_STORAGE_KEY_LENGTH: 512,
  MAX_CURSOR_LENGTH: 256,
  MAX_ID_LENGTH: 64,
  MAX_SUB_KEY_LENGTH: 64,
  MAX_RESOURCE_TYPE_LENGTH: 64,
  MAX_RESOURCE_ID_LENGTH: 128,
  MAX_APP_ID_LENGTH: 64,
  MAX_IMAGE_DIMENSION: 20_000,
  /** S3-compatible presigned URLs cannot outlive seven days. */
  MAX_URL_TTL_SECONDS: 604_800,
} as const;

export const MEDIA_STORAGE_KEY_PREFIX = "media";

/** Canonical audit actions written in the same transaction as the mutation. */
export const MEDIA_AUDIT_ACTIONS = {
  ASSET_FINALIZED: "MEDIA_ASSET_FINALIZED",
  ASSET_DELETED: "MEDIA_ASSET_DELETED",
  USAGE_REGISTERED: "MEDIA_USAGE_REGISTERED",
  USAGE_REMOVED: "MEDIA_USAGE_REMOVED",
} as const;

export type MediaAuditAction =
  (typeof MEDIA_AUDIT_ACTIONS)[keyof typeof MEDIA_AUDIT_ACTIONS];

export const MEDIA_AUDIT_ENTITY_TYPES = {
  ASSET: "MediaAsset",
  USAGE: "MediaUsage",
} as const;

export const MEDIA_AUDIT_ACTOR_ROLE = "MEMBER";

export const MEDIA_SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function isAllowedMimeType(value: string): value is MediaAllowedMimeType {
  return MEDIA_ALLOWED_MIME_TYPES.some((allowed) => allowed === value);
}
