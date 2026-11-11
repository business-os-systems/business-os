/**
 * @suite/media/react — the shared React surface of the workspace media
 * capability. This subpath is deliberately separate from the package barrel so
 * server code that imports @suite/media never pulls React into its bundle.
 */
export {
  createMediaApiClient,
  MediaApiError,
  MEDIA_API_BASE_PATH,
  MEDIA_DEFAULT_PAGE_SIZE,
  type MediaApiClientOptions,
  type MediaApiErrorOptions,
  type MediaClient,
  type MediaImageDimensions,
  type MediaListQuery,
  type MediaProblemInvalidParam,
} from "./media-client.js";

export {
  buildMediaListQuery,
  EMPTY_MEDIA_FILTER,
  MEDIA_TYPE_FILTER_ALL,
  MEDIA_TYPE_FILTER_OPTIONS,
  toMediaTypeFilter,
  type MediaFilterState,
  type MediaTypeFilter,
  type MediaTypeFilterOption,
} from "./media-query.js";

export {
  useMediaAssets,
  toMediaError,
  type MediaAssetsState,
} from "./use-media-assets.js";

export {
  formatMediaFileSize,
  formatMediaTimestamp,
} from "./media-format.js";

export {
  MediaAccessDeniedAlert,
  type MediaAccessDeniedAlertProps,
} from "./media-access-denied.js";

export { MediaPicker, type MediaPickerProps } from "./media-picker.js";

export {
  MediaUploadDialog,
  type MediaUploadDialogProps,
} from "./media-upload-dialog.js";

export {
  MediaProblemAlert,
  type MediaProblemAlertProps,
} from "./media-problem-alert.js";

export type {
  DeleteAssetView,
  FinalizeUploadView,
  MediaAssetDetail,
  MediaAssetPage,
  MediaAssetView,
  MediaUsageView,
} from "../contracts.js";

import { MEDIA_ASSET_KINDS } from "../constants.js";

export type MediaAssetKind = (typeof MEDIA_ASSET_KINDS)[number];
export { MEDIA_ALLOWED_MIME_TYPES, MEDIA_ASSET_KINDS } from "../constants.js";
