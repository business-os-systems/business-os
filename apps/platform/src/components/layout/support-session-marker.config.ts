/**
 * Copy and time presentation for the Platform support-session marker (FR-096).
 * The marker is deliberately non-dismissible: only ending the session removes
 * it, so the operator can never browse the tenant plane without the reminder.
 */
export const SUPPORT_SESSION_MARKER_COPY = {
  label: "Read-only support session",
  operatorLabel: "Platform operator",
  reasonPrefix: "Reason",
  ticketPrefix: "Ticket",
  expiresPrefix: "Expires",
  exit: "Exit",
  ending: "Ending…",
  loading: "Checking for an active support session…",
  loadErrorTitle: "Support-session marker unavailable",
  exitErrorTitle: "Could not end the support session",
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
