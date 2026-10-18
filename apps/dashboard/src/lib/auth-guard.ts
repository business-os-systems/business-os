import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE_NAME,
  decodeSessionPayload,
  isSessionPayloadExpired,
  type SessionPayload,
} from "@/lib/auth-constants";

export interface AuthenticatedUserSession extends SessionPayload {
  organizationId: string;
  organizationName: string;
  userName: string;
  email: string;
}

function isAuthenticatedSession(
  session: SessionPayload | null
): session is AuthenticatedUserSession {
  return Boolean(
    session &&
    session.userId &&
    session.organizationId &&
    session.organizationName &&
    session.userName &&
    session.email &&
    !isSessionPayloadExpired(session)
  );
}

/**
 * Centralized, cached authentication guard for React Server Components.
 * Guarantees that session verification runs once per request across layouts and pages.
 * Redirects unauthenticated visitors to /login.
 */
export const requireAuth = cache(async (): Promise<AuthenticatedUserSession> => {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const rawSession = sessionCookie ? decodeSessionPayload(sessionCookie) : null;

  if (!isAuthenticatedSession(rawSession)) {
    redirect("/login");
  }

  return rawSession;
});

/**
 * Returns the current authenticated session or null without forcing a redirect.
 */
export const getCurrentSession = cache(async (): Promise<AuthenticatedUserSession | null> => {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const rawSession = sessionCookie ? decodeSessionPayload(sessionCookie) : null;

  if (!isAuthenticatedSession(rawSession)) {
    return null;
  }

  return rawSession;
});
