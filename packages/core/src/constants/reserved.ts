/**
 * Canonical host and path reservations (T008, FR-114, FR-117).
 *
 * Every hostname, domain root and reserved name is declared here or in the
 * validated host configuration; no runtime module embeds a hostname literal.
 * The registries are closed tuples so a new reserved value is a compile-time
 * change, never a scattered string.
 */

/** Subdomain labels that are never issued to a tenant (FR-109, FR-114). */
export const RESERVED_HOST_LABELS = [
  "www",
  "app",
  "api",
  "admin",
  "platform",
  "console",
  "control",
  "portal",
  "dashboard",
  "login",
  "signup",
  "preview",
  "mail",
  "support",
  "status",
  "docs",
  "cdn",
  "assets",
  "static",
  "media",
  "billing",
] as const;

export type ReservedHostLabel = (typeof RESERVED_HOST_LABELS)[number];

/**
 * Paths a tenant page may never claim because they shadow platform behaviour
 * (FR-114, FR-115). Matched by exact path or by prefix segment.
 */
export const RESERVED_PATH_PREFIXES = [
  "/dashboard",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/api",
  "/_next",
  "/preview",
  "/.well-known",
  "/sitemap.xml",
  "/robots.txt",
  "/favicon.ico",
] as const;

/** The subset of reserved paths that never belongs to storefront delivery. */
export const NON_STOREFRONT_PATH_PREFIXES = [
  "/dashboard",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/api",
  "/_next",
  "/preview",
  "/.well-known",
  "/sitemap.xml",
  "/robots.txt",
  "/favicon.ico",
] as const;

/** Metadata paths the storefront app serves itself rather than from a page. */
export const SITE_METADATA_PATHS = [
  "/sitemap.xml",
  "/robots.txt",
  "/favicon.ico",
] as const;

/**
 * Every path excluded from crawling by a tenant robots.txt (FR-040, FR-115):
 * the workspace and auth planes, the API and preview endpoints, the Next.js
 * build assets and the framework metadata routes. Closed tuple so a new
 * reserved plane is a compile-time change, never a scattered literal.
 */
export const ROBOTS_DISALLOWED_PATHS = [
  "/dashboard",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/api",
  "/preview",
  "/_next",
  "/.well-known",
  "/manifest.webmanifest",
  "/icon",
  "/apple-icon",
  "/opengraph-image",
  "/twitter-image",
] as const;

export type RobotsDisallowedPath = (typeof ROBOTS_DISALLOWED_PATHS)[number];

const HOSTNAME_MAX_LENGTH = 253;
const HOSTNAME_LABEL_MAX_LENGTH = 63;
const PORT_PATTERN = /^\d{1,5}$/;

function isLowerAlphaNumeric(character: string): boolean {
  return (character >= "a" && character <= "z") || (character >= "0" && character <= "9");
}

function hasValidLabel(label: string): boolean {
  if (label.length === 0 || label.length > HOSTNAME_LABEL_MAX_LENGTH) {
    return false;
  }
  if (label.startsWith("-") || label.endsWith("-")) {
    return false;
  }
  return [...label].every((character) => isLowerAlphaNumeric(character) || character === "-");
}

function stripHostnamePort(value: string): string | null {
  if (value.startsWith("[")) {
    return null;
  }
  const separator = value.indexOf(":");
  if (separator === -1) {
    return value;
  }
  const port = value.slice(separator + 1);
  return PORT_PATTERN.test(port) ? value.slice(0, separator) : null;
}

function dropRootDot(hostname: string): string {
  return hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
}

function isValidHostname(hostname: string): boolean {
  if (hostname.length === 0 || hostname.length > HOSTNAME_MAX_LENGTH) {
    return false;
  }
  if (!hostname.includes(".")) {
    return hostname === "localhost";
  }
  return hostname.split(".").every(hasValidLabel);
}

/**
 * Normalizes a Host header to a lower-case hostname without a port or a
 * trailing root dot. Returns null for anything malformed, so callers fail
 * closed instead of guessing (host header injection).
 */
export function normalizeHostname(rawHost: string | null | undefined): string | null {
  if (rawHost === null || rawHost === undefined) {
    return null;
  }
  const trimmed = rawHost.trim().toLowerCase();
  if (trimmed.length === 0) {
    return null;
  }
  const withoutPort = stripHostnamePort(trimmed);
  if (withoutPort === null) {
    return null;
  }
  const hostname = dropRootDot(withoutPort);
  return isValidHostname(hostname) ? hostname : null;
}

/** Resolves the left-most single label of a tenant host, or null. */
export function getTenantHostLabel(hostname: string, tenantRootDomain: string): string | null {
  const suffix = "." + tenantRootDomain;
  if (!hostname.endsWith(suffix)) {
    return null;
  }
  const label = hostname.slice(0, -suffix.length);
  if (label.length === 0 || label.includes(".")) {
    return null;
  }
  return label;
}

export function isReservedHostLabel(label: string): label is ReservedHostLabel {
  return (RESERVED_HOST_LABELS as readonly string[]).includes(label);
}

/** Normalizes a pathname to a leading-slash form without a trailing slash. */
export function normalizePathname(pathname: string): string {
  if (pathname.length === 0) {
    return "/";
  }
  const withLeadingSlash = pathname.startsWith("/") ? pathname : "/" + pathname;
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")) {
    return withLeadingSlash.slice(0, -1);
  }
  return withLeadingSlash;
}

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/** True when a tenant page may not claim this path (FR-114). */
export function isReservedPath(pathname: string): boolean {
  const candidate = normalizePathname(pathname);
  return RESERVED_PATH_PREFIXES.some((prefix) => matchesPathPrefix(candidate, prefix));
}

/** True when a path belongs to the workspace, auth or API planes (FR-115). */
export function isNonStorefrontPath(pathname: string): boolean {
  const candidate = normalizePathname(pathname);
  return NON_STOREFRONT_PATH_PREFIXES.some((prefix) =>
    matchesPathPrefix(candidate, prefix)
  );
}

/** True for per-host metadata files served outside the page renderer. */
export function isSiteMetadataPath(pathname: string): boolean {
  const candidate = normalizePathname(pathname);
  return (SITE_METADATA_PATHS as readonly string[]).includes(candidate);
}