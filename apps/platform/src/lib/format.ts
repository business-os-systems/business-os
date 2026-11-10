/**
 * One formatter for the whole Platform app. A malformed timestamp renders as
 * "Unavailable" instead of throwing inside React and blanking the screen.
 */
const DATE_ONLY = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export const UNAVAILABLE = "Unavailable" as const;

function toDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string): string {
  const date = toDate(value);
  return date === null ? UNAVAILABLE : DATE_ONLY.format(date);
}

export function formatDateTime(value: string): string {
  const date = toDate(value);
  return date === null ? UNAVAILABLE : DATE_TIME.format(date);
}

/**
 * Renders an instant in the tenant's declared zone (FR-055). A malformed or
 * unknown zone renders "Unavailable" instead of throwing inside React; the
 * server contract validates the zone before it reaches this helper.
 */
export function formatDateTimeInZone(value: string, timeZone: string): string {
  const date = toDate(value);
  if (date === null) {
    return UNAVAILABLE;
  }
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(date);
  } catch (error) {
    if (error instanceof RangeError) {
      return UNAVAILABLE;
    }
    throw error;
  }
}
