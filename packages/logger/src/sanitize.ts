/**
 * Strict Zero-PII Sanitizer & Data Scrubber
 * Location: packages/logger/src/sanitize.ts
 *
 * Recursively cleanses data structures, error objects, and context dictionaries
 * to ensure zero sensitive credentials, authentication cookies, passwords,
 * email addresses, or phone numbers leak into outbound telemetry or crash reports.
 */

export const REDACTED_MARKER = "[REDACTED]";

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /pin/i,
  /authorization/i,
  /cookie/i,
  /credit[-_]?card/i,
  /card[-_]?number/i,
  /cvv/i,
  /api[-_]?key/i,
  /session/i,
  /private[-_]?key/i,
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Matches NANP (3-3-4) as well as Indian 10-digit numbers, grouped 5-5 or unbroken.
const PHONE_REGEX =
  /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{5}[-.\s]?\d{5}|\d{10})/g;
const CONNECTION_CREDENTIALS_REGEX =
  /(postgres(?:ql)?:\/\/[^:\s/@]+:)([^@\s]+)(@)/gi;
const SECRET_ASSIGNMENT_REGEX =
  /((?:password|passwd|secret|token|api[_-]?key)\s*[=:]\s*)([^\s,;]+)/gi;

/**
 * Checks if an object property key is classified as sensitive.
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Scrubs email addresses and phone numbers from raw string values.
 */
export function scrubStringValues(val: string): string {
  let cleaned = val.replace(EMAIL_REGEX, "[EMAIL_REDACTED]");
  cleaned = cleaned.replace(PHONE_REGEX, "[PHONE_REDACTED]");
  cleaned = cleaned.replace(CONNECTION_CREDENTIALS_REGEX, "$1[REDACTED]$3");
  cleaned = cleaned.replace(SECRET_ASSIGNMENT_REGEX, "$1[REDACTED]");
  return cleaned;
}

/**
 * Deeply sanitizes any payload (objects, arrays, errors, primitives) to enforce Zero-PII.
 * Protected against circular references.
 */
export function sanitizePii<T>(target: T, seen = new WeakSet<object>()): T {
  if (target === null || target === undefined) {
    return target;
  }

  if (typeof target === "string") {
    return scrubStringValues(target) as unknown as T;
  }

  if (
    typeof target === "number" ||
    typeof target === "boolean" ||
    typeof target === "bigint"
  ) {
    return target;
  }

  if (typeof target === "function" || typeof target === "symbol") {
    return REDACTED_MARKER as unknown as T;
  }

  if (target instanceof Error) {
    const sanitizedError: Record<string, unknown> = {
      name: target.name,
      message: scrubStringValues(target.message),
      stack: target.stack ? scrubStringValues(target.stack) : undefined,
    };
    return sanitizedError as unknown as T;
  }

  if (Array.isArray(target)) {
    return target.map((item) => sanitizePii(item, seen)) as unknown as T;
  }

  if (typeof target === "object") {
    if (seen.has(target)) {
      return "[CIRCULAR]" as unknown as T;
    }
    seen.add(target);

    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(target)) {
      if (isSensitiveKey(key)) {
        sanitizedObj[key] = REDACTED_MARKER;
      } else {
        sanitizedObj[key] = sanitizePii(value, seen);
      }
    }
    return sanitizedObj as unknown as T;
  }

  return target;
}
