const DEFAULT_PROVIDER_NAME = "OAuth Provider";
const BADGE_SUFFIX = " Collision Challenge";

/** Human-readable OAuth provider label, with a neutral fallback before details load. */
export function formatProviderName(providerId: string | null | undefined): string {
  if (providerId === null || providerId === undefined || providerId.length === 0) {
    return DEFAULT_PROVIDER_NAME;
  }
  return providerId.charAt(0).toUpperCase() + providerId.slice(1);
}

/** Collision-challenge badge label, omitted until the provider is known. */
export function formatCollisionBadge(
  providerId: string | null | undefined
): string | undefined {
  if (providerId === null || providerId === undefined || providerId.length === 0) {
    return undefined;
  }
  return formatProviderName(providerId) + BADGE_SUFFIX;
}
