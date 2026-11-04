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
