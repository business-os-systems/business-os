import { getBetterAuthSecret } from "../env.js";
import {
  TENANT_SESSION_COOKIE_NAME,
  createTenantSessionCookieOptions,
} from "../session-cookie.js";
import {
  computeHmacSha256,
  constantTimeEqual,
  decodeBase64UrlText,
  encodeBase64UrlText,
} from "../crypto/hmac.js";

export const DEFAULT_SESSION_COOKIE_NAME = TENANT_SESSION_COOKIE_NAME;
export const SESSION_COOKIE_NAME = DEFAULT_SESSION_COOKIE_NAME;

// Ephemeral default: 24 hours rolling expiration (maxAge: 86400)
export const SESSION_EPHEMERAL_MAX_AGE_SECONDS =
  Number(process.env.SESSION_EPHEMERAL_MAX_AGE_SECONDS) || 86400;

// Persistent default ("Keep me signed in"): 30 days (maxAge: 2592000)
export const SESSION_PERSISTENT_MAX_AGE_SECONDS =
  Number(process.env.SESSION_PERSISTENT_MAX_AGE_SECONDS) || 2592000;

export interface SessionCookieOptions {
  name: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  domain?: string;
  maxAge: number; // in seconds
}

/**
 * Core User Identity segment (ISP & SRP).
 * Identifies the natural person holding the authentication ticket.
 */
export interface UserIdentityContext {
  userId: string;
  email: string;
  userName: string;
}

/**
 * Organizational & Branch Execution scope (ISP & SRP).
 * Scopes tenant boundaries and ground operational outlet assignment.
 */
export interface TenantSessionContext {
  organizationId: string;
  organizationName: string;
  activeBranchId?: string;
  activeBranchName?: string;
}

/**
 * Role-Based Access Control & Privilege claims (ISP & SRP).
 * Determines authorization matrix and administrative elevation.
 */
export interface SessionAuthorizationContext {
  role?: string;
  permissions?: string[];
}

/**
 * Temporal lifecycle bounds (ISP & SRP).
 * Controls issuance timestamp and absolute expiration cutoff.
 */
export interface SessionLifecycleContext {
  timestamp: number;
  issuedAt?: number;
  expiresAt?: number;
  isEphemeral?: boolean;
  tokenVersion?: number;
  sessionTimeoutSeconds?: number;
}

/**
 * Client visual personalization preferences (ISP & SRP).
 */
export interface SessionPreferencesContext {
  themePreference?: "system" | "light" | "dark";
}

/**
 * Onboarding lifecycle state context (ISP & SRP).
 */
export interface SessionOnboardingContext {
  onboardingStatus?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  currentOnboardingStep?: number | null;
}

/**
 * Host-binding segment. A ticket issued on a tenant host records that host, so
 * a replay on another host is rejected even if the cookie is forced across
 * hosts (FR-111).
 */
export interface SessionHostBindingContext {
  tenantHost?: string;
}

/**
 * Consolidated Session Payload.
 * Composed via Interface Segregation Principle from discrete domain contexts.
 */
export interface SessionPayload
  extends UserIdentityContext,
    Partial<TenantSessionContext>,
    SessionAuthorizationContext,
    SessionLifecycleContext,
    SessionPreferencesContext,
    SessionOnboardingContext,
    SessionHostBindingContext {}

/**
 * Creates the tenant session cookie attributes. Every tenant session is
 * host-only: __Host- prefixed, Secure, HttpOnly, SameSite=Lax, Path=/, and
 * never a Domain attribute (FR-111). The legacy shared-domain option is gone.
 */
export function createSessionCookieOptions(
  keepSignedIn = false,
  customMaxAgeSeconds?: number,
  cookieName = DEFAULT_SESSION_COOKIE_NAME
): SessionCookieOptions {
  let maxAge = keepSignedIn
    ? SESSION_PERSISTENT_MAX_AGE_SECONDS
    : SESSION_EPHEMERAL_MAX_AGE_SECONDS;

  if (typeof customMaxAgeSeconds === "number" && customMaxAgeSeconds > 0) {
    maxAge = customMaxAgeSeconds;
  }

  const hostOnly = createTenantSessionCookieOptions(maxAge);
  return { ...hostOnly, name: cookieName };
}

export function encodeSessionPayload(payload: SessionPayload): string {
  return encodeBase64UrlText(JSON.stringify(payload));
}

export const DEFAULT_KEY_VERSION = "v1";

export function decodeSessionPayload(token: string): SessionPayload | null {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const parts = token.split(".");
  if (parts.length !== 2 && parts.length !== 3) return null;
  const rawPayload = parts.length === 3 ? parts[1] : parts[0];
  if (!rawPayload) return null;
  const json = decodeBase64UrlText(rawPayload);
  if (json === null) return null;
  try {
    return JSON.parse(json) as SessionPayload;
  } catch {
    return null;
  }
}

export async function signSessionToken(
  payload: string,
  options?: { kid?: string }
): Promise<string> {
  const secret = getBetterAuthSecret();
  const kid = options?.kid;
  const target = kid ? `${kid}.${payload}` : payload;
  const hmac = await computeHmacSha256(target, secret);
  return `${target}.${hmac}`;
}

export function isSessionPayloadExpired(payload: SessionPayload): boolean {
  if (!payload?.timestamp) return true;
  if (payload.expiresAt) {
    return Date.now() >= payload.expiresAt;
  }
  const maxAgeMs = payload.isEphemeral
    ? SESSION_EPHEMERAL_MAX_AGE_SECONDS * 1000
    : SESSION_PERSISTENT_MAX_AGE_SECONDS * 1000;
  return Date.now() - payload.timestamp > maxAgeMs;
}

export function isSessionPayloadIdleTimedOut(payload: SessionPayload): boolean {
  if (!payload?.timestamp) return true;
  if (!payload.sessionTimeoutSeconds || payload.sessionTimeoutSeconds <= 0) return false;
  return Date.now() - payload.timestamp > payload.sessionTimeoutSeconds * 1000;
}

export async function verifySessionToken(token: string): Promise<boolean> {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const parts = token.split(".");
  if (parts.length !== 2 && parts.length !== 3) return false;
  const target = parts.length === 3 ? `${parts[0]}.${parts[1]}` : parts[0];
  const sig = parts.length === 3 ? parts[2] : parts[1];
  if (!target || !sig) return false;

  try {
    const secret = getBetterAuthSecret();
    const expectedSig = await computeHmacSha256(target, secret);
    return constantTimeEqual(sig, expectedSig);
  } catch {
    return false;
  }
}

/**
 * Extracts a bearer token from an HTTP Authorization header.
 *
 * @param authHeader e.g. "Bearer eyJhbGciOi..."
 * @returns The extracted token or null.
 */
export function extractTokenFromHeader(authHeader?: string | null): string | null {
  if (!authHeader) return null;
  const trimmed = authHeader.trim();
  if (trimmed.startsWith("Bearer ")) {
    return trimmed.slice(7).trim();
  }
  return null;
}

/**
 * Extracts the session token from a standard Cookie header string.
 *
 * @param cookieHeader The raw Cookie header string.
 * @param cookieName The target cookie name (defaults to "suite_session").
 */
export function extractTokenFromCookie(
  cookieHeader?: string | null,
  cookieName = DEFAULT_SESSION_COOKIE_NAME
): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.trim().split("=");
    if (name === cookieName) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}