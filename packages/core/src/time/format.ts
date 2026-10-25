/**
 * UTC storage and branch-timezone rendering.
 *
 * Instants are stored in UTC. Presentation always uses the branch time zone
 * through Intl; server local time is never consulted (CT-8).
 */

export interface BranchTimeContext {
  readonly timeZone: string;
  readonly locale: string;
}

const TIMESTAMP_WITH_OFFSET_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;

export function isValidIanaTimeZone(timeZone: string): boolean {
  if (timeZone.trim() === "") {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return true;
  } catch (error) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

export function toUtcInstant(value: Date | string | number): Date {
  const instant =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Invalid instant: ${String(value)}`);
  }
  return instant;
}

export function formatUtcTimestamp(value: Date | string | number): string {
  return toUtcInstant(value).toISOString();
}

export function parseUtcTimestamp(value: string): Date {
  if (!TIMESTAMP_WITH_OFFSET_PATTERN.test(value)) {
    throw new Error(
      "Timestamp must include an explicit UTC offset (for example 2026-10-25T12:00:00Z)"
    );
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return instant;
}

function createFormatter(
  context: BranchTimeContext,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  if (context.timeZone.trim() === "") {
    throw new Error("A branch time zone is required");
  }
  if (context.locale.trim() === "") {
    throw new Error("A branch locale is required");
  }
  try {
    return new Intl.DateTimeFormat(context.locale, {
      ...options,
      timeZone: context.timeZone,
    });
  } catch (error) {
    throw new Error(
      `Invalid branch time zone "${context.timeZone}" or locale "${context.locale}"`,
      { cause: error }
    );
  }
}

export function formatBranchDateTime(
  value: Date | string | number,
  context: BranchTimeContext
): string {
  return createFormatter(context, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(toUtcInstant(value));
}

export function formatBranchDate(
  value: Date | string | number,
  context: BranchTimeContext
): string {
  return createFormatter(context, { dateStyle: "medium" }).format(
    toUtcInstant(value)
  );
}

export function formatBranchTime(
  value: Date | string | number,
  context: BranchTimeContext
): string {
  return createFormatter(context, { timeStyle: "short" }).format(
    toUtcInstant(value)
  );
}

export function formatBranchDateTimeWithZone(
  value: Date | string | number,
  context: BranchTimeContext
): string {
  return createFormatter(context, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(toUtcInstant(value));
}
