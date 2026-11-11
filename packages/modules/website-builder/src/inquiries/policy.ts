import { z } from "zod";

/**
 * Inquiry policy: the values that make a captured enquiry behave the same in
 * every layer (routes, services, tests and the dashboard contract).
 *
 * Nothing here reads configuration or the database. Retention, payload caps,
 * contact-field gating and the status machine are declared once so a route can
 * never invent a fifth status or a softer limit.
 */

/** The JSON subset an inquiry payload may contain (validated at the boundary). */
export type InquiryJson =
  | string
  | number
  | boolean
  | null
  | InquiryJson[]
  | { [key: string]: InquiryJson };

export type InquiryPayload = Record<string, InquiryJson>;

export const inquiryJsonValueSchema: z.ZodType<InquiryJson> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(inquiryJsonValueSchema),
    z.record(inquiryJsonValueSchema),
  ])
);

export const inquiryPayloadSchema = z.record(inquiryJsonValueSchema);

export const INQUIRY_STATUS = {
  NEW: "NEW",
  READ: "READ",
  ARCHIVED: "ARCHIVED",
  SPAM: "SPAM",
} as const;

export type InquiryStatus = (typeof INQUIRY_STATUS)[keyof typeof INQUIRY_STATUS];

export const INQUIRY_STATUS_VALUES = [
  INQUIRY_STATUS.NEW,
  INQUIRY_STATUS.READ,
  INQUIRY_STATUS.ARCHIVED,
  INQUIRY_STATUS.SPAM,
] as const;

/** NEW -> READ -> ARCHIVED | SPAM. Terminal states never transition again. */
const INQUIRY_STATUS_TRANSITIONS = {
  NEW: [INQUIRY_STATUS.READ],
  READ: [INQUIRY_STATUS.ARCHIVED, INQUIRY_STATUS.SPAM],
  ARCHIVED: [],
  SPAM: [],
} as const satisfies Record<InquiryStatus, readonly InquiryStatus[]>;

export const INQUIRY_SPAM_VERDICT = {
  HONEYPOT: "HONEYPOT",
  CHALLENGE: "CHALLENGE",
} as const;

export type InquirySpamVerdict =
  (typeof INQUIRY_SPAM_VERDICT)[keyof typeof INQUIRY_SPAM_VERDICT];

/** Declared retention (FR-049): capture time + 365 days. */
export const INQUIRY_RETENTION_DAYS = 365;

/** Hard payload cap in bytes (FR-044). */
export const INQUIRY_PAYLOAD_MAX_BYTES = 65_536;

/** Cursor pagination hard cap (CT-5). */
export const INQUIRY_LIMIT = { default: 20, max: 100 } as const;

/** The contact values that require cms:leads:pii to read (FR-048). */
export const INQUIRY_CONTACT_FIELDS = ["name", "email", "phone"] as const;

export type InquiryContactField = (typeof INQUIRY_CONTACT_FIELDS)[number];

export interface InquiryContactFields {
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
}

export const CMS_INQUIRY_ERROR = {
  STATUS_CONFLICT: "INQUIRY_STATUS_CONFLICT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
} as const;

export const CMS_INQUIRY_EVENT_TYPE = {
  RECEIVED: "cms.inquiry.received",
} as const;

export function isInquiryStatus(value: unknown): value is InquiryStatus {
  return typeof value === "string" && Object.hasOwn(INQUIRY_STATUS_TRANSITIONS, value);
}

export function canTransitionInquiryStatus(
  from: InquiryStatus,
  to: InquiryStatus
): boolean {
  if (from === to) {
    return true;
  }
  return INQUIRY_STATUS_TRANSITIONS[from].some((allowed) => allowed === to);
}

/**
 * Sensitive field names are refused rather than stored: a password, card
 * number or one-time code written into an enquiry becomes a secret in a table
 * built for messages (FR-044, CWE-522).
 */
const SENSITIVE_TOKEN_PATTERN =
  /(^|[^a-z])(password|passwd|pwd|otp|one_time_code|onetimecode|totp|pin|ssn|cvv|cvc|csc)([^a-z]|$)/i;
const SENSITIVE_COMPOUND_PATTERN =
  /(credit_?card|card_?number|card_?no|security_?code|social_?security)/i;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_TOKEN_PATTERN.test(key) || SENSITIVE_COMPOUND_PATTERN.test(key);
}

interface FieldPath {
  readonly path: string;
  readonly key: string;
}

const MAX_FIELD_DEPTH = 6;

function collectFieldPaths(
  value: unknown,
  prefix: string,
  depth: number,
  found: FieldPath[]
): void {
  if (depth > MAX_FIELD_DEPTH || value === null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectFieldPaths(entry, prefix + "[" + index + "]", depth + 1, found);
    });
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix.length === 0 ? key : prefix + "." + key;
    found.push({ path, key });
    collectFieldPaths(entry, path, depth + 1, found);
  }
}

/** Returns the paths of every sensitive field name, never their values. */
export function findSensitiveFieldNames(payload: Record<string, unknown>): string[] {
  const fields: FieldPath[] = [];
  collectFieldPaths(payload, "", 0, fields);
  return fields.filter((field) => isSensitiveKey(field.key)).map((field) => field.path);
}

export function payloadByteSize(payload: unknown): number {
  return Buffer.byteLength(JSON.stringify(payload), "utf8");
}

function normalizeFieldKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const CONTACT_KEY_MAP = {
  name: new Set(["name", "fullname", "firstname", "lastname", "contactname"]),
  email: new Set(["email", "emailaddress", "contactemail", "mail"]),
  phone: new Set(["phone", "phonenumber", "mobile", "mobilephone", "telephone", "tel", "contactphone"]),
} as const;

function readContactValue(
  payload: Record<string, unknown>,
  field: InquiryContactField
): string | null {
  const accepted = CONTACT_KEY_MAP[field];
  for (const [key, value] of Object.entries(payload)) {
    if (!accepted.has(normalizeFieldKey(key))) {
      continue;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return null;
}

/** Extracts the three gated contact values from a submitted payload. */
export function extractContactFields(payload: Record<string, unknown>): InquiryContactFields {
  return {
    name: readContactValue(payload, "name"),
    email: readContactValue(payload, "email"),
    phone: readContactValue(payload, "phone"),
  };
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function looksLikeEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_SHAPE.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }
  if (isRecord(value)) {
    return redactRecord(value);
  }
  return value;
}

function redactRecord(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = redactEntry(key, entry);
  }
  return result;
}

function redactEntry(key: string, value: unknown): unknown {
  const normalized = normalizeFieldKey(key);
  const isContact = INQUIRY_CONTACT_FIELDS.some((field) =>
    CONTACT_KEY_MAP[field].has(normalized)
  );
  return isContact ? null : redactValue(value);
}

/** Returns a copy safe for a caller without cms:leads:pii. */
export function redactContactFields(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return redactRecord(payload);
}

const PREVIEW_KEYS = ["message", "notes", "comment", "comments", "details", "subject", "company", "enquiry", "inquiry"];
const PREVIEW_MAX_LENGTH = 140;

/** A short, non-contact excerpt so a list row is recognisable without PII. */
export function inquiryPreview(payload: Record<string, unknown>): string {
  for (const key of PREVIEW_KEYS) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim().slice(0, PREVIEW_MAX_LENGTH);
    }
  }
  return "No message";
}

export function hasContactFields(contact: InquiryContactFields): boolean {
  return contact.name !== null || contact.email !== null || contact.phone !== null;
}
