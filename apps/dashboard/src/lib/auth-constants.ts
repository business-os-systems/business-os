export const SESSION_COOKIE_NAME = "suite_session";

export interface SessionCookieOptions {
  name: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  maxAge: number;
}

export function createSessionCookieOptions(
  isProduction = process.env.NODE_ENV === "production"
): SessionCookieOptions {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  };
}

const DEFAULT_SECRET = "suite-auth-session-signing-secret-key-32ch";

function getSecretKey(): string {
  return process.env.BETTER_AUTH_SECRET || DEFAULT_SECRET;
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

export interface SessionPayload {
  userId: string;
  email: string;
  organizationId: string;
  organizationName: string;
  role: string;
  userName: string;
  activeBranchId?: string;
  activeBranchName?: string;
  timestamp: number;
}

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
  const secret = getSecretKey();
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
    const secret = getSecretKey();
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
