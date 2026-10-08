export const DEFAULT_SESSION_COOKIE_NAME = "suite_session";

export interface SessionCookieOptions {
  name: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  maxAge: number; // in seconds
}

/**
 * Creates standardized enterprise cookie security attributes for session tokens.
 * Enforces HTTP-only, Secure (in production/HTTPS), and SameSite protections against CSRF/XSS.
 */
export function createSessionCookieOptions(
  isProduction = process.env.NODE_ENV === "production",
  cookieName = DEFAULT_SESSION_COOKIE_NAME
): SessionCookieOptions {
  return {
    name: cookieName,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  };
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
