/**
 * Default operational day turnover hour (4:00 AM branch local time).
 */
export const DEFAULT_TURNOVER_HOUR = 4;

/**
 * Standard business date string regex format (YYYY-MM-DD).
 */
export const BUSINESS_DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

/**
 * Validates whether a given string is a valid business date in YYYY-MM-DD format.
 */
export function isValidBusinessDate(dateStr: string): boolean {
  if (!BUSINESS_DATE_REGEX.test(dateStr)) return false;
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day
  );
}

/**
 * Calculates the operational business date (YYYY-MM-DD) for a given timestamp
 * and branch timezone.
 *
 * In commercial operations (hotels, restaurants, nightlife), a business day
 * does not turnover at midnight (00:00:00). Operations between 00:00:00 and turnoverHour (default 04:00:00)
 * belong to the previous calendar day's folios and shift ledgers.
 *
 * @param timestamp - The absolute timestamp (Date, number epoch, or ISO string).
 * @param timezone - Standard IANA timezone string (e.g. "Asia/Kolkata", "America/New_York", "UTC").
 * @param turnoverHour - Branch-configured turnover hour (0 - 23, defaults to 4).
 * @returns The operational business date string formatted as "YYYY-MM-DD".
 */
export function calculateBusinessDate(
  timestamp: Date | string | number,
  timezone: string,
  turnoverHour = DEFAULT_TURNOVER_HOUR
): string {
  const date =
    timestamp instanceof Date
      ? timestamp
      : new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Invalid timestamp provided to calculateBusinessDate: ${String(timestamp)}`);
  }

  if (turnoverHour < 0 || turnoverHour > 23 || !Number.isInteger(turnoverHour)) {
    throw new RangeError(`turnoverHour must be an integer between 0 and 23, received: ${turnoverHour}`);
  }

  // Format parts in the target IANA timezone with 24-hour cycle (00..23)
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;

  for (const part of parts) {
    if (part.type === "year") year = Number.parseInt(part.value, 10);
    if (part.type === "month") month = Number.parseInt(part.value, 10);
    if (part.type === "day") day = Number.parseInt(part.value, 10);
    if (part.type === "hour") hour = Number.parseInt(part.value, 10);
  }

  // If local hour is before turnover hour, this timestamp belongs to yesterday's operational day
  if (hour < turnoverHour) {
    const prevDate = new Date(Date.UTC(year, month - 1, day));
    prevDate.setUTCDate(prevDate.getUTCDate() - 1);
    const prevYear = prevDate.getUTCFullYear();
    const prevMonth = String(prevDate.getUTCMonth() + 1).padStart(2, "0");
    const prevDay = String(prevDate.getUTCDate()).padStart(2, "0");
    return `${prevYear}-${prevMonth}-${prevDay}`;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Determines whether Night Audit turnover is due for a branch.
 *
 * Night Audit is due if the current operational business date is strictly greater
 * than the last successfully closed business date.
 *
 * @param lastClosedBusinessDate - Date string (YYYY-MM-DD) of the last audited/closed business date.
 * @param currentBusinessDate - Date string (YYYY-MM-DD) of the active operational business date.
 */
export function isNightAuditDue(
  lastClosedBusinessDate: string,
  currentBusinessDate: string
): boolean {
  if (!isValidBusinessDate(lastClosedBusinessDate)) {
    throw new TypeError(`Invalid lastClosedBusinessDate format: ${lastClosedBusinessDate}. Expected YYYY-MM-DD.`);
  }
  if (!isValidBusinessDate(currentBusinessDate)) {
    throw new TypeError(`Invalid currentBusinessDate format: ${currentBusinessDate}. Expected YYYY-MM-DD.`);
  }

  return currentBusinessDate > lastClosedBusinessDate;
}

/**
 * Advances a business date string (YYYY-MM-DD) by a given number of calendar days.
 */
export function addBusinessDays(businessDate: string, days: number): string {
  if (!isValidBusinessDate(businessDate)) {
    throw new TypeError(`Invalid businessDate: ${businessDate}`);
  }
  const [yearStr, monthStr, dayStr] = businessDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);

  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns the next operational business date (YYYY-MM-DD).
 */
export function getNextBusinessDate(businessDate: string): string {
  return addBusinessDays(businessDate, 1);
}

/**
 * Returns the previous operational business date (YYYY-MM-DD).
 */
export function getPreviousBusinessDate(businessDate: string): string {
  return addBusinessDays(businessDate, -1);
}

/**
 * Calculates the calendar days difference between two business dates (dateB - dateA).
 */
export function getBusinessDateDiffDays(dateA: string, dateB: string): number {
  if (!isValidBusinessDate(dateA) || !isValidBusinessDate(dateB)) {
    throw new TypeError(`Invalid businessDate arguments: ${dateA}, ${dateB}`);
  }
  const [yA, mA, dA] = dateA.split("-").map(Number);
  const [yB, mB, dB] = dateB.split("-").map(Number);

  const utcA = Date.UTC(yA!, mA! - 1, dA!);
  const utcB = Date.UTC(yB!, mB! - 1, dB!);

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((utcB - utcA) / MS_PER_DAY);
}
