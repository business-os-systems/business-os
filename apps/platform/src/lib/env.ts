/**
 * Server-only Platform configuration read through one validated boundary.
 * P14: feature code never reads process.env directly.
 */
export function getBreakGlassProxySecret(): string | undefined {
  const value = process.env.BREAK_GLASS_PROXY_SECRET;
  if (value === undefined || value.trim() === "") return undefined;
  return value;
}

const EMAIL_SHAPE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** Monitored abuse address published at /abuse; an unset value fails closed. */
export function getAbuseContactEmail(): string {
  const value = process.env.ABUSE_CONTACT_EMAIL?.trim();
  if (value === undefined || value.length === 0 || !EMAIL_SHAPE.test(value)) {
    throw new Error(
      "ABUSE_CONTACT_EMAIL must hold a monitored email address; it is unset or invalid."
    );
  }
  return value;
}
