/**
 * Post-login redirect sanitizer. A single safe-redirect contract prevents
 * open-redirect drift between the dispatcher, the query parameter and the
 * onboarding gate (P17).
 */

const DISALLOWED_REDIRECT_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
] as const;

const ONBOARDING_COMPLETED = "COMPLETED";

function isInternalPath(candidate: string): boolean {
  if (!candidate.startsWith("/")) return false;
  return !candidate.startsWith("//") && !candidate.startsWith("/\\");
}

/**
 * Returns the redirect target only when it is a safe internal path and the
 * account is not mid-onboarding. Otherwise returns null so the caller falls
 * back to the dispatcher route.
 */
export function sanitizeRedirect(
  queryRedirect: string | null,
  onboardingStatus?: string
): string | null {
  if (queryRedirect === null || !isInternalPath(queryRedirect)) {
    return null;
  }
  if (
    DISALLOWED_REDIRECT_PREFIXES.some((prefix) =>
      queryRedirect.startsWith(prefix)
    )
  ) {
    return null;
  }
  if (
    onboardingStatus !== undefined &&
    onboardingStatus.length > 0 &&
    onboardingStatus !== ONBOARDING_COMPLETED
  ) {
    return null;
  }
  return queryRedirect;
}
