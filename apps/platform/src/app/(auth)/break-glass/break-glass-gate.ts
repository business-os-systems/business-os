import { timingSafeEqual } from "node:crypto";
import { getBreakGlassProxySecret } from "@/lib/env";

/**
 * The break-glass admission decision.
 *
 * Caddy terminates the separate break-glass hostname with a required client
 * certificate, then overwrites two headers before proxying to the app: the
 * admitted flag and a shared secret that must match BREAK_GLASS_PROXY_SECRET.
 * The app never reads or stores the offline key itself. A missing, unset or
 * different secret is a generic denial, never a hint that the route exists.
 */
export const BREAK_GLASS_HEADER = "x-break-glass-verified";
export const BREAK_GLASS_SECRET_HEADER = "x-break-glass-secret";
const BREAK_GLASS_ADMITTED_VALUE = "1";

function secretsMatch(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (providedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(providedBytes, expectedBytes);
}

export function isBreakGlassAdmitted(
  headerValue: string | null | undefined,
  secretValue: string | null | undefined,
  configuredSecret: string | undefined = getBreakGlassProxySecret(),
): boolean {
  if (headerValue !== BREAK_GLASS_ADMITTED_VALUE) return false;
  if (configuredSecret === undefined || configuredSecret.trim() === "") {
    return false;
  }
  if (secretValue === null || secretValue === undefined || secretValue === "") {
    return false;
  }
  return secretsMatch(secretValue, configuredSecret);
}
