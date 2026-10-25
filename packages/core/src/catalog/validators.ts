import {
  CATALOG_DEFINITIONS,
  type CatalogKey,
} from "../constants/catalogs.js";
import { isValidIanaTimeZone } from "../time/format.js";

export type CatalogValidationResult =
  | { readonly valid: true; readonly normalized: string }
  | { readonly valid: false; readonly reason: string };

const MAXIMUM_CATALOG_CODE_LENGTH = 64;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const LANGUAGE_PATTERN =
  /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?(?:-[A-Za-z0-9]{5,8})*$/;
const SLUG_PATTERN = /^[a-z0-9_]{2,64}$/;
const DATE_FORMAT_PATTERN =
  /^(?:YYYY|YY|MMMM|MMM|MM|M|DD|D)(?:[-/. ](?:YYYY|YY|MMMM|MMM|MM|M|DD|D)){1,2}$/i;
const DATE_TOKEN_PATTERN = /YYYY|YY|MMMM|MMM|MM|M|DD|D/gi;
const TIME_FORMAT_PATTERN =
  /^(?:(?:HH|H):mm(?::ss)?|(?:hh|h):mm(?::ss)? [Aa])$/i;

function valid(normalized: string): CatalogValidationResult {
  return { valid: true, normalized };
}

function invalid(reason: string): CatalogValidationResult {
  return { valid: false, reason };
}

function normalizeLanguageTag(tag: string): string {
  return tag
    .split("-")
    .map((part, index) => {
      if (index === 0) {
        return part.toLowerCase();
      }
      if (part.length === 2) {
        return part.toUpperCase();
      }
      if (part.length === 4) {
        return `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`;
      }
      return part.toLowerCase();
    })
    .join("-");
}

function isYearToken(token: string): boolean {
  const upper = token.toUpperCase();
  return upper === "YYYY" || upper === "YY";
}

function isMonthToken(token: string): boolean {
  const upper = token.toUpperCase();
  return (
    upper === "MMMM" || upper === "MMM" || upper === "MM" || upper === "M"
  );
}

function isDayToken(token: string): boolean {
  const upper = token.toUpperCase();
  return upper === "DD" || upper === "D";
}

function isValidDateFormat(code: string): boolean {
  if (!DATE_FORMAT_PATTERN.test(code)) {
    return false;
  }
  const tokens = code.match(DATE_TOKEN_PATTERN) ?? [];
  return (
    tokens.some(isYearToken) &&
    tokens.some(isMonthToken) &&
    tokens.some(isDayToken)
  );
}

export function normalizeCatalogCode(key: CatalogKey, code: string): string {
  const trimmed = code.trim();
  const { format } = CATALOG_DEFINITIONS[key];
  switch (format) {
    case "iso4217":
    case "iso3166":
      return trimmed.toUpperCase();
    case "bcp47":
      return normalizeLanguageTag(trimmed);
    case "iana_timezone":
      return trimmed;
    case "date_format":
    case "time_format":
    case "slug":
      return trimmed.toLowerCase();
    default: {
      const exhaustive: never = format;
      return exhaustive;
    }
  }
}

export function validateCatalogCode(
  key: CatalogKey,
  code: string
): CatalogValidationResult {
  const normalized = normalizeCatalogCode(key, code);
  if (normalized.length === 0) {
    return invalid("A reference value is required.");
  }
  if (normalized.length > MAXIMUM_CATALOG_CODE_LENGTH) {
    return invalid(
      `A reference value must be at most ${MAXIMUM_CATALOG_CODE_LENGTH} characters.`
    );
  }

  const { format } = CATALOG_DEFINITIONS[key];
  switch (format) {
    case "iso4217":
      return CURRENCY_PATTERN.test(normalized)
        ? valid(normalized)
        : invalid("Currency codes must be three ISO 4217 letters.");
    case "iso3166":
      return COUNTRY_PATTERN.test(normalized)
        ? valid(normalized)
        : invalid("Country codes must be two ISO 3166-1 letters.");
    case "bcp47":
      return LANGUAGE_PATTERN.test(normalized)
        ? valid(normalized)
        : invalid("Language tags must be valid BCP 47 tags, such as en-US.");
    case "iana_timezone":
      return isValidIanaTimeZone(normalized)
        ? valid(normalized)
        : invalid("Time zones must be valid IANA identifiers, such as Asia/Kolkata.");
    case "date_format":
      return isValidDateFormat(normalized)
        ? valid(normalized)
        : invalid(
            "Date formats must combine a year, month and day, such as YYYY-MM-DD."
          );
    case "time_format":
      return TIME_FORMAT_PATTERN.test(normalized)
        ? valid(normalized)
        : invalid("Time formats must be HH:mm, HH:mm:ss, hh:mm A or hh:mm:ss A.");
    case "slug":
      return SLUG_PATTERN.test(normalized)
        ? valid(normalized)
        : invalid(
            "Values must be 2 to 64 lower-case letters, digits or underscores."
          );
    default: {
      const exhaustive: never = format;
      return exhaustive;
    }
  }
}
