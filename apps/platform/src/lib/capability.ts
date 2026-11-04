/**
 * One fail-closed platform capability predicate. Missing or empty context
 * denies, so navigation, PII and lifecycle gates cannot drift apart.
 */
export function hasPlatformCapability(
  capabilities: readonly string[] | undefined | null,
  required: string,
): boolean {
  if (capabilities === undefined || capabilities === null) {
    return false;
  }
  return capabilities.includes(required);
}
