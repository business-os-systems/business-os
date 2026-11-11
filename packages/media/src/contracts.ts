import { z } from "zod";
import {
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_ASSET_KINDS,
  MEDIA_LIMITS,
  MEDIA_SHA256_PATTERN,
  MEDIA_USAGE_STATUSES,
} from "./constants.js";

export const uploadIntentSchema = z
  .object({
    fileName: z.string().min(1).max(MEDIA_LIMITS.MAX_FILE_NAME_LENGTH),
    mimeType: z.enum(MEDIA_ALLOWED_MIME_TYPES),
    sizeBytes: z.number().int().positive(),
    checksum: z.string().regex(MEDIA_SHA256_PATTERN),
  })
  .strict();

export const finalizeUploadSchema = z
  .object({
    storageKey: z
      .string()
      .min(1)
      .max(MEDIA_LIMITS.MAX_STORAGE_KEY_LENGTH),
    checksum: z.string().regex(MEDIA_SHA256_PATTERN),
    width: z
      .number()
      .int()
      .positive()
      .max(MEDIA_LIMITS.MAX_IMAGE_DIMENSION)
      .optional(),
    height: z
      .number()
      .int()
      .positive()
      .max(MEDIA_LIMITS.MAX_IMAGE_DIMENSION)
      .optional(),
  })
  .strict();

export const registerUsageSchema = z
  .object({
    appId: z.string().min(1).max(MEDIA_LIMITS.MAX_APP_ID_LENGTH),
    resourceType: z
      .string()
      .min(1)
      .max(MEDIA_LIMITS.MAX_RESOURCE_TYPE_LENGTH),
    resourceId: z.string().min(1).max(MEDIA_LIMITS.MAX_RESOURCE_ID_LENGTH),
    subKey: z
      .string()
      .max(MEDIA_LIMITS.MAX_SUB_KEY_LENGTH)
      .default(""),
    status: z.enum(MEDIA_USAGE_STATUSES),
  })
  .strict();

const QUERY_BOOLEAN = {
  true: true,
  false: false,
} as const;

export const listAssetsQuerySchema = z.object({
  cursor: z
    .string()
    .min(1)
    .max(MEDIA_LIMITS.MAX_CURSOR_LENGTH)
    .optional(),
  type: z.enum(MEDIA_ASSET_KINDS).optional(),
  search: z.string().max(MEDIA_LIMITS.MAX_SEARCH_LENGTH).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MEDIA_LIMITS.MAX_PAGE_SIZE)
    .default(MEDIA_LIMITS.DEFAULT_PAGE_SIZE),
  unused: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : QUERY_BOOLEAN[value])),
});

export type UploadIntentBody = z.infer<typeof uploadIntentSchema>;
export type FinalizeUploadBody = z.infer<typeof finalizeUploadSchema>;
export type RegisterUsageBody = z.infer<typeof registerUsageSchema>;
export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;

export interface MediaActor {
  readonly organizationId: string;
  readonly userId: string;
}

export interface MediaAssetView {
  readonly id: string;
  readonly kind: "IMAGE";
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly url: string;
  readonly status: "ACTIVE" | "ARCHIVED";
  readonly usageCount: number;
  readonly createdAt: string;
}

export interface MediaUsageView {
  readonly id: string;
  readonly assetId: string;
  readonly appId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly subKey: string;
  readonly status: "DRAFT" | "PUBLISHED";
  readonly createdAt: string;
}

export interface MediaAssetDetail extends MediaAssetView {
  readonly usages: MediaUsageView[];
}

export interface MediaAssetPage {
  readonly items: MediaAssetView[];
  readonly nextCursor: string | null;
}

/** The render-time projection a consuming application needs; never persisted. */
export interface MediaAssetResolution {
  readonly assetId: string;
  readonly url: string;
  readonly fileName: string;
  readonly width: number | null;
  readonly height: number | null;
}

export type MediaAssetResolutionMap = Readonly<
  Record<string, MediaAssetResolution>
>;

export interface UploadIntentView {
  readonly uploadUrl: string;
  readonly storageKey: string;
  readonly expiresAt: string;
  readonly maxBytes: number;
  readonly allowedTypes: string[];
  readonly requiredHeaders: Record<string, string>;
}

export interface FinalizeUploadView {
  readonly assetId: string;
  readonly url: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly checksum: string;
  readonly storageBytes: number;
  readonly duplicate: boolean;
}

export interface DeleteAssetView {
  readonly assetId: string;
  readonly deleted: true;
}

export interface RemoveUsageView {
  readonly usageId: string;
  readonly removed: true;
}
