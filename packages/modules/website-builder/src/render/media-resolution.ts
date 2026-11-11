import type {
  MediaAssetMap,
  MediaReference,
} from "../ast/types.js";

export interface ResolvedMediaImage {
  readonly url: string;
  readonly alt: string | null;
  readonly fileName: string | null;
  readonly width: number | null;
  readonly height: number | null;
}

export interface ResolveMediaImageInput {
  readonly reference: MediaReference | undefined;
  readonly legacyUrl: string | undefined;
  readonly legacyAlt: string | undefined;
  readonly media: MediaAssetMap | undefined;
}

/**
 * Resolves a media slot to a renderable image. An asset reference wins over the
 * legacy URL; a reference whose asset is unavailable renders nothing rather
 * than leaking a stale URL (FR-051, FR-120).
 */
export function resolveMediaImage(
  input: ResolveMediaImageInput
): ResolvedMediaImage | null {
  const reference = input.reference;
  if (reference === undefined) {
    return input.legacyUrl === undefined
      ? null
      : {
          url: input.legacyUrl,
          alt: input.legacyAlt ?? null,
          fileName: null,
          width: null,
          height: null,
        };
  }
  if (reference.kind === "url") {
    return {
      url: reference.url,
      alt: input.legacyAlt ?? null,
      fileName: null,
      width: null,
      height: null,
    };
  }
  const asset = input.media?.[reference.assetId];
  if (asset === undefined) {
    return null;
  }
  return {
    url: asset.url,
    alt: reference.alt ?? input.legacyAlt ?? asset.fileName,
    fileName: asset.fileName,
    width: asset.width,
    height: asset.height,
  };
}
