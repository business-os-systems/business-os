import type { InvalidParamDetail } from "@suite/core/errors";
import type { ConfigFormErrors } from "./config-form.types";

const BLOCKED_RECORD_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

/** A dynamic key is safe only when it is a normal own-property name. */
export function isSafeFieldName(name: string): boolean {
  return !BLOCKED_RECORD_KEYS.has(name);
}

/**
 * Resolves a problem-details field name onto one of the form own keys.
 * Supports the quota envelope items.0.limitValue shape without guessing
 * which field the server meant (Deterministic Registry Law).
 */
export function fieldForIssue(
  fieldNames: readonly string[],
  issueName: string
): string | null {
  if (!isSafeFieldName(issueName)) return null;
  if (fieldNames.includes(issueName)) return issueName;
  return fieldNames.find((name) => issueName.endsWith("." + name)) ?? null;
}

export function mapInvalidParams<T extends object>(
  fieldNames: readonly (keyof T & string)[],
  issues: readonly InvalidParamDetail[]
): ConfigFormErrors<T> {
  const errors: ConfigFormErrors<T> = {};
  for (const issue of issues) {
    const field = fieldForIssue(fieldNames, issue.name);
    if (field !== null) {
      errors[field as keyof T & string] = issue.reason;
    }
  }
  return errors;
}

export function unmappedInvalidParams<T extends object>(
  fieldNames: readonly (keyof T & string)[],
  issues: readonly InvalidParamDetail[]
): readonly InvalidParamDetail[] {
  return issues.filter(
    (issue) => fieldForIssue(fieldNames, issue.name) === null
  );
}
