/**
 * Host-only tenant session cookie (FR-111, T055).
 *
 * A tenant session is created on the tenant host and used only there. It is
 * deliberately separate from the operator control cookie, carries no Domain
 * attribute, and uses the __Host- prefix so a browser refuses to accept it
 * from a subdomain or from a shared parent domain.
 */

import { decodeBase64UrlText } from "./crypto/hmac.js";

/** __Host- requires Secure, Path=/ and no Domain attribute. */
export const TENANT_SESSION_COOKIE_NAME = "__Host-bos_session";

export const TENANT_SESSION_COOKIE_PATH = "/";

export type TenantSessionSameSite = "lax";

export interface HostOnlySessionCookieOptions {
  readonly name: typeof TENANT_SESSION_COOKIE_NAME;
  readonly httpOnly: true;
  readonly secure: true;
  readonly sameSite: TenantSessionSameSite;
  readonly path: typeof TENANT_SESSION_COOKIE_PATH;
  readonly maxAge: number;
}

/** The only attribute set a tenant session is ever written with. */
export function createTenantSessionCookieOptions(
  maxAgeSeconds: number
): HostOnlySessionCookieOptions {
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new Error("Tenant session maxAge must be a positive whole number of seconds");
  }
  return {
    name: TENANT_SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: TENANT_SESSION_COOKIE_PATH,
    maxAge: maxAgeSeconds,
  };
}

/**
 * Explicit host binding for a session that carries a tenant host claim.
 *
 * The browser's host-only rule is the primary defence; this check rejects a
 * replayed or proxied cookie whose signed claim names another host. A session
 * without the claim is a pre-migration ticket and is left to the cookie scope.
 */
export function isTenantSessionHostBound(
  tenantHostClaim: string | undefined,
  normalizedRequestHost: string | null
): boolean {
  if (tenantHostClaim === undefined) {
    return true;
  }
  if (normalizedRequestHost === null || normalizedRequestHost.length === 0) {
    return false;
  }
  return tenantHostClaim.trim().toLowerCase() === normalizedRequestHost;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Reads the unverified tenant host claim from a session token. Callers that
 * make a security decision must verify the token signature first; this helper
 * exists for cookie cleanup where deleting a forged cookie is harmless.
 */
export function readTenantHostClaim(token: string): string | undefined {
  const segments = token.split(".");
  const payloadSegment = segments.length === 3 ? segments[1] : segments[0];
  if (payloadSegment === undefined || payloadSegment.length === 0) {
    return undefined;
  }
  const rawPayload = decodeBase64UrlText(payloadSegment);
  if (rawPayload === null) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(rawPayload);
    if (!isRecord(parsed)) {
      return undefined;
    }
    const claim = parsed.tenantHost;
    return typeof claim === "string" && claim.length > 0 ? claim : undefined;
  } catch {
    return undefined;
  }
}

export interface SerializedCookieSink {
  set(options: {
    readonly name: string;
    readonly value: string;
    readonly httpOnly: boolean;
    readonly secure: boolean;
    readonly sameSite: TenantSessionSameSite;
    readonly path: string;
    readonly maxAge: number;
  }): void;
  delete(name: string): void;
}

/** Writes the tenant session with the one sanctioned attribute set. */
export function applyTenantSessionCookie(
  sink: { readonly cookies: SerializedCookieSink },
  token: string,
  maxAgeSeconds: number
): void {
  const options = createTenantSessionCookieOptions(maxAgeSeconds);
  sink.cookies.set({ ...options, value: token });
}

/** Expires the tenant session on the current host. */
export function clearTenantSessionCookie(sink: {
  readonly cookies: SerializedCookieSink;
}): void {
  sink.cookies.delete(TENANT_SESSION_COOKIE_NAME);
}
