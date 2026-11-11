import { isNonStorefrontPath, isReservedPath, normalizePathname } from "@suite/core";

/**
 * Converts catch-all route segments into one canonical page address.
 *
 * Workspace, auth, API, preview and metadata addresses are never storefront
 * pages, even when the catch-all matcher would otherwise reach this route. A
 * malformed or reserved address returns null and the page answers not-found.
 */

const MAX_PATH_LENGTH = 2048;
const MAX_SEGMENT_LENGTH = 191;

function isSafeCharacter(character: string): boolean {
  return (
    (character >= "a" && character <= "z") ||
    (character >= "0" && character <= "9") ||
    character === "-"
  );
}

function isSafeSegment(segment: string): boolean {
  if (segment.length === 0 || segment.length > MAX_SEGMENT_LENGTH) {
    return false;
  }
  if (segment.startsWith("-") || segment.endsWith("-")) {
    return false;
  }
  return [...segment].every(isSafeCharacter);
}

export function toStorefrontPath(segments: readonly string[] | undefined): string | null {
  if (segments === undefined || segments.length === 0) {
    return "/";
  }
  if (segments.some((segment) => segment.length === 0)) {
    return null;
  }
  const raw = "/" + segments.join("/");
  if (raw.length > MAX_PATH_LENGTH || raw.includes("\\")) {
    return null;
  }
  const normalized = normalizePathname(raw);
  if (isReservedPath(normalized) || isNonStorefrontPath(normalized)) {
    return null;
  }
  const parts = normalized === "/" ? [] : normalized.slice(1).split("/");
  return parts.every(isSafeSegment) ? normalized : null;
}
