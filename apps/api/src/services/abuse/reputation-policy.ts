/**
 * Structural abuse signals (FR-134, FR-137). These are cheap checks over the
 * hostname the platform already owns; they never fetch a tenant-supplied URL.
 */

export const RESERVED_HOST_LABELS = [
  "www",
  "api",
  "admin",
  "mail",
  "smtp",
  "imap",
  "ftp",
  "ns1",
  "ns2",
  "support",
  "help",
  "billing",
  "security",
  "abuse",
  "postmaster",
  "webmaster",
  "localhost",
  "platform",
  "app",
  "dashboard",
  "status",
  "cdn",
  "static",
  "assets",
  "login",
  "signin",
  "auth",
  "oauth",
  "payments",
  "checkout",
] as const;

export const PROTECTED_BRAND_TOKENS = [
  "business-os",
  "businessos",
  "business-os-systems",
] as const;

/** More active hosts than this for one tenant is a bulk-abuse signal. */
export const EXCESSIVE_HOST_CLAIM_LIMIT = 25;

export const ABUSE_SIGNALS = {
  RESERVED_LABEL: "RESERVED_LABEL",
  HOST_IMPERSONATION: "HOST_IMPERSONATION",
  EXCESSIVE_HOST_CLAIMS: "EXCESSIVE_HOST_CLAIMS",
} as const;

export type AbuseSignal = (typeof ABUSE_SIGNALS)[keyof typeof ABUSE_SIGNALS];

export const REPUTATION_VERDICTS = {
  PASS: "PASS",
  BLOCKED: "BLOCKED",
  REVIEW: "REVIEW",
  FEED_UNAVAILABLE: "FEED_UNAVAILABLE",
} as const;

export type ReputationVerdict =
  (typeof REPUTATION_VERDICTS)[keyof typeof REPUTATION_VERDICTS];

const RESERVED = new Set<string>(RESERVED_HOST_LABELS);
const PROTECTED = new Set<string>(PROTECTED_BRAND_TOKENS);
const RESERVED_LABEL_PREFIX = /^([a-z0-9-]+)[.-]/;

/** Normalizes a host; an empty or malformed value is never trusted. */
export function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function labelsOf(hostname: string): string[] {
  return hostname.split(".").filter((label) => label.length > 0);
}

function isReservedLabel(label: string): boolean {
  if (RESERVED.has(label)) return true;
  const prefix = RESERVED_LABEL_PREFIX.exec(label)?.[1];
  return prefix !== undefined && RESERVED.has(prefix);
}

function isImpersonating(label: string): boolean {
  if (PROTECTED.has(label)) return true;
  return PROTECTED_BRAND_TOKENS.some((token) => label.startsWith(token + "-"));
}

/** Structural labels before the registrable suffix are the tenant's choice. */
function tenantLabels(labels: readonly string[]): string[] {
  if (labels.length <= 2) return [...labels];
  return labels.slice(0, labels.length - 2);
}

export function structuralSignals(input: {
  readonly hostname: string;
  readonly activeHostCount: number;
}): AbuseSignal[] {
  const labels = labelsOf(normalizeHost(input.hostname));
  const signals: AbuseSignal[] = [];
  if (labels.length === 0) return signals;
  if (isReservedLabel(labels[0] ?? "")) {
    signals.push(ABUSE_SIGNALS.RESERVED_LABEL);
  }
  if (tenantLabels(labels).some(isImpersonating)) {
    signals.push(ABUSE_SIGNALS.HOST_IMPERSONATION);
  }
  if (input.activeHostCount > EXCESSIVE_HOST_CLAIM_LIMIT) {
    signals.push(ABUSE_SIGNALS.EXCESSIVE_HOST_CLAIMS);
  }
  return signals;
}

export function classifyVerdict(input: {
  readonly signals: readonly AbuseSignal[];
  readonly blocked: boolean;
  readonly feedUnavailable: boolean;
}): ReputationVerdict {
  if (input.feedUnavailable) return REPUTATION_VERDICTS.FEED_UNAVAILABLE;
  if (input.blocked) return REPUTATION_VERDICTS.BLOCKED;
  if (input.signals.length > 0) return REPUTATION_VERDICTS.REVIEW;
  return REPUTATION_VERDICTS.PASS;
}
