/**
 * Canonical reference catalog keys and their validation formats.
 *
 * The catalog values themselves are database-owned; this registry only names
 * the categories and the format each category must satisfy (FR-101, FR-107).
 */

export const CATALOG_KEYS = [
  "currency",
  "country",
  "language",
  "timezone",
  "date_format",
  "time_format",
  "tax_system",
  "branch_type",
  "branch_capability",
  "industry_category",
] as const;

export type CatalogKey = (typeof CATALOG_KEYS)[number];

export type StandardCatalogCodeFormat =
  | "iso4217"
  | "iso3166"
  | "bcp47"
  | "iana_timezone"
  | "slug";

/**
 * Pattern catalogs are validated against a declared standard, never a list of
 * enumerated values. The standard names the allowed field symbols and the
 * minimum number of fields, so a new format made of those symbols is accepted
 * without a code change (FR-101, FR-107).
 */
export interface CatalogPatternStandard {
  readonly standard: "unicode-ldml";
  readonly fieldLetters: string;
  readonly minimumFields: number;
}

interface BaseCatalogDefinition {
  readonly key: CatalogKey;
  readonly label: string;
  readonly description: string;
  readonly isSystem: boolean;
}

export interface StandardCatalogDefinition extends BaseCatalogDefinition {
  readonly format: StandardCatalogCodeFormat;
}

export interface PatternCatalogDefinition extends BaseCatalogDefinition {
  readonly format: "pattern";
  readonly pattern: CatalogPatternStandard;
}

export type CatalogDefinition =
  | StandardCatalogDefinition
  | PatternCatalogDefinition;

export type CatalogCodeFormat =
  | StandardCatalogCodeFormat
  | PatternCatalogDefinition["format"];

/** Field symbols declared by Unicode LDML date/time patterns (TR35). */
const UNICODE_LDML_FIELD_LETTERS =
  "GyYuUrQqMLwWdDFgEecabBhHKkmsSAzZOvVxX";

export const CATALOG_DEFINITIONS = {
  currency: {
    key: "currency",
    label: "Currencies",
    description: "ISO 4217 currency codes used for money and pricing.",
    format: "iso4217",
    isSystem: true,
  },
  country: {
    key: "country",
    label: "Countries",
    description: "ISO 3166-1 alpha-2 country codes.",
    format: "iso3166",
    isSystem: true,
  },
  language: {
    key: "language",
    label: "Languages",
    description: "BCP 47 language tags used for localization.",
    format: "bcp47",
    isSystem: true,
  },
  timezone: {
    key: "timezone",
    label: "Time zones",
    description: "IANA time zone identifiers used for local rendering.",
    format: "iana_timezone",
    isSystem: true,
  },
  date_format: {
    key: "date_format",
    label: "Date formats",
    description: "Date presentation patterns declared against Unicode LDML.",
    format: "pattern",
    pattern: {
      standard: "unicode-ldml",
      fieldLetters: UNICODE_LDML_FIELD_LETTERS,
      minimumFields: 3,
    },
    isSystem: true,
  },
  time_format: {
    key: "time_format",
    label: "Time formats",
    description: "Time presentation patterns declared against Unicode LDML.",
    format: "pattern",
    pattern: {
      standard: "unicode-ldml",
      fieldLetters: UNICODE_LDML_FIELD_LETTERS,
      minimumFields: 1,
    },
    isSystem: true,
  },
  tax_system: {
    key: "tax_system",
    label: "Tax systems",
    description: "Tax regimes and statutory calculation families.",
    format: "slug",
    isSystem: true,
  },
  branch_type: {
    key: "branch_type",
    label: "Branch types",
    description: "Operational unit types such as homestay or warehouse.",
    format: "slug",
    isSystem: true,
  },
  branch_capability: {
    key: "branch_capability",
    label: "Branch capabilities",
    description: "Operational capabilities a branch can declare.",
    format: "slug",
    isSystem: true,
  },
  industry_category: {
    key: "industry_category",
    label: "Industry categories",
    description: "Industry classification used for catalog presentation.",
    format: "slug",
    isSystem: true,
  },
} as const satisfies Record<CatalogKey, CatalogDefinition>;

const CATALOG_KEY_SET: ReadonlySet<string> = new Set(CATALOG_KEYS);

export function isCatalogKey(value: string): value is CatalogKey {
  return CATALOG_KEY_SET.has(value);
}

export function getCatalogDefinition(key: CatalogKey): CatalogDefinition {
  return CATALOG_DEFINITIONS[key];
}
