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

export type CatalogCodeFormat =
  | "iso4217"
  | "iso3166"
  | "bcp47"
  | "iana_timezone"
  | "date_format"
  | "time_format"
  | "slug";

export interface CatalogDefinition {
  readonly key: CatalogKey;
  readonly label: string;
  readonly description: string;
  readonly format: CatalogCodeFormat;
  readonly isSystem: boolean;
}

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
    description: "Supported date presentation formats.",
    format: "date_format",
    isSystem: true,
  },
  time_format: {
    key: "time_format",
    label: "Time formats",
    description: "Supported time presentation formats.",
    format: "time_format",
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
