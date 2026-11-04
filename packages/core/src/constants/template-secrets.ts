/**
 * Fingerprints, not the values, of secrets that were once published in the
 * repository templates. A deployment still carrying one is signing sessions
 * with a key that is public in git history, so it must not start in production.
 *
 * The plaintext values are deliberately absent. They stay recoverable from git
 * history for audit, but they no longer live in the working tree and no secret
 * scanner has to flag this file.
 *
 * FNV-1a 64-bit is used because it is synchronous and isomorphic: the check
 * also runs in the browser bundle without a crypto polyfill, and collisions
 * only ever produce a false rejection of an already-banned value.
 */
export const TEMPLATE_SECRET_FINGERPRINTS = [
  "de934883d144033c",
  "d7825b5da7f019c0",
  "ff4b2737947dc050",
  "56b7a4ec02d356ab",
  "62690921e62941ca",
] as const;

export const TEMPLATE_SECRET_PREFIX = "CHANGE_ME";

const TEMPLATE_SECRET_FINGERPRINT_SET: ReadonlySet<string> = new Set(
  TEMPLATE_SECRET_FINGERPRINTS
);

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_64_BIT_MASK = 0xffffffffffffffffn;

/** Stable 16-character fingerprint of a candidate secret. */
export function fingerprintSecret(value: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & FNV_64_BIT_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

export function isTemplateSecret(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith(TEMPLATE_SECRET_PREFIX) ||
    TEMPLATE_SECRET_FINGERPRINT_SET.has(fingerprintSecret(trimmed))
  );
}
