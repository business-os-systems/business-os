function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * The Platform renders timestamps in UTC (format.ts); the datetime-local input
 * must therefore read and write UTC too, or an operator sees a shifted expiry.
 */
export function toDateTimeLocal(value: string | null): string {
  if (value === null) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function fromDateTimeLocal(value: string): Date {
  return new Date(value.endsWith("Z") ? value : `${value}Z`);
}
