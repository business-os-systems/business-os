import { isReservedHostLabel, isReservedPath, normalizePathname } from "@suite/core";
import { AppError, ValidationError } from "@suite/core/errors";

const SITE_SLUG_MAX_LENGTH = 63;
const SEGMENT_CHARACTERS = /^[a-z0-9-]+$/;

function isValidSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    SEGMENT_CHARACTERS.test(segment) &&
    !segment.startsWith("-") &&
    !segment.endsWith("-") &&
    !segment.includes("--")
  );
}

function invalidPath(detail: string, name: string, reason: string): ValidationError {
  return new ValidationError(detail, [{ name, reason }], { code: "RESERVED_PATH" });
}

/**
 * Normalizes a page address to one leading slash, lower case and single
 * segments. Backslashes, dot segments and encoded traversal are refused rather
 * than resolved, so a stored path can never escape the storefront route.
 */
export function normalizePagePath(rawPath: string): string {
  const withSlashes =
    "/" +
    rawPath
      .trim()
      .toLowerCase()
      .replaceAll("\\", "/")
      .replace(/\/+/g, "/")
      .replace(/^\/+/, "");
  const normalized = normalizePathname(withSlashes);
  if (normalized === "/") {
    return normalized;
  }
  // Reserved addresses are refused before the character rule so metadata paths
  // such as /sitemap.xml report RESERVED_PATH, not a generic validation error.
  if (isReservedPath(normalized)) {
    throw invalidPath(
      "The address " + normalized + " is reserved by the platform.",
      "path",
      "Choose an address that is not /dashboard, /login, /api, /preview, /sitemap.xml, /robots.txt or /.well-known."
    );
  }
  const segments = normalized.slice(1).split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw invalidPath(
      "Page addresses cannot contain relative dot segments.",
      "path",
      "Remove . or .. segments from the address."
    );
  }
  if (!segments.every(isValidSegment)) {
    throw new ValidationError(
      "Page addresses must be lower-case words joined by hyphens.",
      [{ name: "path", reason: "Use lower-case letters, digits and hyphens, separated by slashes." }],
      { code: "VALIDATION_FAILED" }
    );
  }
  return normalized;
}

/** Refuses a reserved platform path (FR-021, FR-114). */
export function assertPagePathAllowed(path: string): void {
  if (!isReservedPath(path)) {
    return;
  }
  throw invalidPath(
    "The address " + path + " is reserved by the platform.",
    "path",
    "Choose an address that is not /dashboard, /login, /api, /preview, /sitemap.xml, /robots.txt or /.well-known."
  );
}

/** Normalizes a site slug and refuses reserved host labels (FR-021, FR-114). */
export function normalizeSiteSlug(rawSlug: string): string {
  const slug = rawSlug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length === 0 || slug.length > SITE_SLUG_MAX_LENGTH) {
    throw new ValidationError(
      "The site address must be 1 to " + SITE_SLUG_MAX_LENGTH + " characters.",
      [{ name: "slug", reason: "Use lower-case letters, digits and hyphens." }],
      { code: "VALIDATION_FAILED" }
    );
  }
  if (isReservedHostLabel(slug)) {
    throw new ValidationError(
      "The site address " + slug + " is reserved by the platform.",
      [{ name: "slug", reason: "Choose a different subdomain label." }],
      { code: "RESERVED_SLUG" }
    );
  }
  return slug;
}

/**
 * Browser-safe validation for the studio and wizard: returns the message to
 * show verbatim, or null when the address is acceptable.
 */
export function pagePathError(rawPath: string): string | null {
  try {
    const path = normalizePagePath(rawPath);
    assertPagePathAllowed(path);
    return null;
  } catch (error: unknown) {
    return error instanceof AppError ? error.detail : "Enter a valid page address.";
  }
}

/** Browser-safe site address validation for the create-site wizard. */
export function siteSlugError(rawSlug: string): string | null {
  try {
    normalizeSiteSlug(rawSlug);
    return null;
  } catch (error: unknown) {
    return error instanceof AppError ? error.detail : "Enter a valid site address.";
  }
}
