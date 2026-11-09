/**
 * Copy and time presentation for the tenant support-session banner. The banner
 * is deliberately non-dismissible (FR-048); keeping the text here stops the
 * component from hardcoding presentation strings.
 */
export const SUPPORT_SESSION_BANNER_COPY = {
  label: "Support session active",
  readOnly: "Read-only",
  expiresPrefix: "Expires",
  operatorPrefix: "Operator",
} as const;

const UTC_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export function formatSupportSessionExpiry(expiresAt: string): string {
  return `${UTC_FORMATTER.format(new Date(expiresAt))} UTC`;
}
