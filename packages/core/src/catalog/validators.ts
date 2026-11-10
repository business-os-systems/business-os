import {
  CATALOG_DEFINITIONS,
  type CatalogKey,
  type CatalogPatternStandard,
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
const PATTERN_FIELD_TOKEN = /([A-Za-z])\1*/g;
const MAXIMUM_PATTERN_FIELD_LENGTH = 5;

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

/**
 * Validates the shape of a declared Unicode LDML pattern. The allowed field
 * symbols and the minimum field count are catalog metadata, so a new format
 * made of standard symbols is accepted without changing this module (FR-107).
 */
function isValidPattern(
  code: string,
  standard: CatalogPatternStandard
): boolean {
  const tokens = code.match(PATTERN_FIELD_TOKEN) ?? [];
  if (tokens.length < standard.minimumFields) {
    return false;
  }
  const allowedLetters: ReadonlySet<string> = new Set(
    standard.fieldLetters.split("")
  );
  return tokens.every(
    (token) =>
      token.length <= MAXIMUM_PATTERN_FIELD_LENGTH &&
      allowedLetters.has(token.charAt(0))
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
    case "pattern":
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

  const definition = CATALOG_DEFINITIONS[key];
  switch (definition.format) {
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
    case "pattern":
      return isValidPattern(normalized, definition.pattern)
        ? valid(normalized)
        : invalid(
            `${definition.label} must use standard field symbols and at least ${definition.pattern.minimumFields} of them.`
          );
    case "slug":
      return SLUG_PATTERN.test(normalized)
        ? valid(normalized)
        : invalid(
            "Values must be 2 to 64 lower-case letters, digits or underscores."
          );
    default: {
      /* c8 ignore next 3 -- exhaustive guard: a new rule type fails typecheck */
      const exhaustive: never = definition;
      return exhaustive;
    }
  }
}
