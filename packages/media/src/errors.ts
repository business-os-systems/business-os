import {
  AppError,
  type InvalidParamDetail,
} from "@suite/core/errors";
import {
  PLATFORM_ERROR_CODES,
  type PlatformErrorCode,
} from "@suite/core";

/** Typed RFC 7807 media error whose slug comes from the one error registry. */
export function createMediaError(
  code: PlatformErrorCode,
  detail: string,
  invalidParams?: readonly InvalidParamDetail[]
): AppError {
  const definition = PLATFORM_ERROR_CODES[code];
  return new AppError({
    status: definition.status,
    code,
    title: definition.title,
    detail,
    type: definition.slug,
    invalidParams,
  });
}

export interface MediaUsageReference {
  readonly appId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly subKey: string;
}

/**
 * Deletion is refused while published content references an asset (FR-121).
 * The referencing locations are carried as invalidParams so the RFC 7807 body
 * names every one of them, not just a count.
 */
export class MediaInUseError extends AppError {
  readonly references: readonly MediaUsageReference[];

  constructor(references: readonly MediaUsageReference[]) {
    super({
      status: PLATFORM_ERROR_CODES.MEDIA_IN_USE.status,
      code: "MEDIA_IN_USE",
      title: PLATFORM_ERROR_CODES.MEDIA_IN_USE.title,
      type: PLATFORM_ERROR_CODES.MEDIA_IN_USE.slug,
      detail: `This asset is referenced by published content at ${references.length} location(s): ${formatReferences(references)}. Remove those references before deleting.`,
      invalidParams: references.map((reference) => ({
        name: `${reference.appId}:${reference.resourceType}`,
        reason: buildReferenceLabel(reference),
      })),
    });
    this.references = references;
  }
}

function buildReferenceLabel(reference: MediaUsageReference): string {
  const suffix =
    reference.subKey.length > 0 ? `#${reference.subKey}` : "";
  return `${reference.resourceId}${suffix}`;
}

function formatReferences(
  references: readonly MediaUsageReference[]
): string {
  return references
    .map(
      (reference) =>
        `${reference.appId}/${reference.resourceType}/${buildReferenceLabel(reference)}`
    )
    .join(", ");
}
