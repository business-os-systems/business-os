import { isProduction as defaultIsProduction, getBetterAuthSecret } from "./env";

export const SESSION_COOKIE_NAME = "suite_session";

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
  maxAge: number;
}

/**
 * Creates session cookie options with configurable ephemeral vs persistent lifetimes.
 * Enforces HttpOnly, Lax, Path=/, and Secure in production.
 */
export function createSessionCookieOptions(
  isProduction = defaultIsProduction,
  keepSignedIn = false,
  customMaxAgeSeconds?: number
): SessionCookieOptions {
  let maxAge = keepSignedIn
    ? SESSION_PERSISTENT_MAX_AGE_SECONDS
    : SESSION_EPHEMERAL_MAX_AGE_SECONDS;

  if (typeof customMaxAgeSeconds === "number" && customMaxAgeSeconds > 0) {
    maxAge = customMaxAgeSeconds;
  }

  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    const byte = bytes[i] ?? 0;
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function computeHmacSha256(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(payload)
  );
  return bufferToBase64Url(signature);
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
  role: string;
  isSuperAdmin?: boolean;
  permissions?: string[];
}

/**
 * Temporal lifecycle bounds (ISP & SRP).
 * Controls issuance timestamp and absolute expiration cutoff.
 */
export interface SessionLifecycleContext {
  timestamp: number;
  expiresAt?: number;
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
 * Consolidated Session Payload.
 * Composed via Interface Segregation Principle from discrete domain contexts.
 */
export interface SessionPayload
  extends UserIdentityContext,
    Partial<TenantSessionContext>,
    SessionAuthorizationContext,
    SessionLifecycleContext,
    SessionPreferencesContext,
    SessionOnboardingContext {}

export function encodeSessionPayload(payload: SessionPayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    const b = bytes[i] ?? 0;
    binary += String.fromCharCode(b);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeSessionPayload(token: string): SessionPayload | null {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [rawPayload] = token.split(".");
  if (!rawPayload) return null;
  try {
    let base64 = rawPayload.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as SessionPayload;
  } catch {
    return null;
  }
}

export async function signSessionToken(payload: string): Promise<string> {
  const secret = getBetterAuthSecret();
  const hmac = await computeHmacSha256(payload, secret);
  return `${payload}.${hmac}`;
}

export async function verifySessionToken(token: string): Promise<boolean> {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  if (!payload || !sig) return false;

  try {
    const secret = getBetterAuthSecret();
    const expectedSig = await computeHmacSha256(payload, secret);

    // Constant-time comparison
    if (sig.length !== expectedSig.length) return false;
    let mismatch = 0;
    for (let i = 0; i < sig.length; i++) {
      mismatch |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}
