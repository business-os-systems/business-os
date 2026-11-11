/**
 * @suite/media - the shared workspace media capability (FR-050 to FR-052,
 * FR-119 to FR-122). Runtime consumers use this barrel; the deterministic
 * in-memory storage adapter lives only on the @suite/media/testing subpath.
 */
export {
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_ASSET_KINDS,
  MEDIA_ASSET_STATUSES,
  MEDIA_AUDIT_ACTIONS,
  MEDIA_AUDIT_ENTITY_TYPES,
  MEDIA_LIMITS,
  MEDIA_SHA256_PATTERN,
  MEDIA_STORAGE_KEY_PREFIX,
  MEDIA_USAGE_STATUSES,
  isAllowedMimeType,
  type MediaAllowedMimeType,
  type MediaAuditAction,
} from "./constants.js";

export {
  assertMediaConfiguration,
  readMediaConfig,
  type MediaConfig,
} from "./env.js";

export {
  finalizeUploadSchema,
  listAssetsQuerySchema,
  registerUsageSchema,
  uploadIntentSchema,
  type DeleteAssetView,
  type FinalizeUploadBody,
  type FinalizeUploadView,
  type ListAssetsQuery,
  type MediaActor,
  type MediaAssetDetail,
  type MediaAssetPage,
  type MediaAssetResolution,
  type MediaAssetResolutionMap,
  type MediaAssetView,
  type MediaUsageView,
  type RegisterUsageBody,
  type RemoveUsageView,
  type UploadIntentBody,
  type UploadIntentView,
} from "./contracts.js";

export { MediaInUseError, createMediaError, type MediaUsageReference } from "./errors.js";

export {
  assertAllowedMimeType,
  assertKnownAppId,
  assertValidChecksum,
  assertValidStorageKey,
  assertWithinSizeLimit,
  buildStorageKey,
  escapeSearchTerm,
  extensionForMimeType,
  normalizeFileName,
  validateUploadIntent,
  verifyUploadedObject,
  type FinalizeUploadInput,
  type UploadIntentInput,
  type ValidatedUploadIntent,
  type VerifiedUpload,
} from "./validation.js";

export {
  decodeIdCursor,
  encodeIdCursor,
  pageSlice,
  type PageSlice,
} from "./pagination.js";

export type {
  PresignedUpload,
  PresignedUploadRequest,
  StorageAdapter,
  StorageObjectHead,
} from "./storage/adapter.js";

export { createS3StorageAdapter } from "./storage/s3-adapter.js";

export {
  assertAssetDeletable,
  registerUsageIfAssetExists,
  registerUsageInTransaction,
  removeUsageInTransaction,
  toUsageView,
  type DeletableUsage,
  type MediaUsageClient,
} from "./assets/usage-service.js";

export {
  createMediaService,
  type MediaService,
  type MediaServiceDependencies,
} from "./assets/asset-service.js";

export { resolveMediaAssets } from "./assets/resolution.js";
