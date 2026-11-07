/**
 * Approved launch content for the ten reference catalogs (#249 / T017).
 *
 * Approval: 2026-11-07. Country and currency are committed standards
 * snapshots; timezone is enumerated from the runtime. Language, format, tax,
 * branch and industry lists are the curated launch lists approved with the
 * ticket. A change to any list is a new approval, never an incidental code
 * edit.
 *
 * Codes are normalized by the shared catalog validators before they reach the
 * database. Date-format codes therefore persist in lower case (dd/mm/yyyy),
 * even though the approved vocabulary is written in upper case.
 */

import type { Prisma } from "@prisma/client";
import {
  CATALOG_KEYS,
  getCatalogDefinition,
  validateCatalogCode,
  type CatalogKey,
} from "@suite/core";

export const CATALOG_SEED_ACTOR = "system:reference-catalog-seed";

const MAXIMUM_CATALOG_LABEL_LENGTH = 191;

/**
 * ISO 3166-1 alpha-2, including IN first so the existing India-first product
 * default survives the move from the hardcoded country list.
 */
function splitCodes(codes: string): string[] {
  return codes.trim().split(/\s+/);
}

const COUNTRY_CODES = splitCodes(`
  IN AD AE AF AG AI AL AM AO AQ
  AR AS AT AU AW AX AZ BA BB BD
  BE BF BG BH BI BJ BL BM BN BO
  BQ BR BS BT BV BW BY BZ CA CC
  CD CF CG CH CI CK CL CM CN CO
  CR CU CV CW CX CY CZ DE DJ DK
  DM DO DZ EC EE EG EH ER ES ET
  FI FJ FK FM FO FR GA GB GD GE
  GF GG GH GI GL GM GN GP GQ GR
  GS GT GU GW GY HK HM HN HR HT
  HU ID IE IL IM IO IQ IR IS IT
  JE JM JO JP KE KG KH KI KM KN
  KP KR KW KY KZ LA LB LC LI LK
  LR LS LT LU LV LY MA MC MD ME
  MF MG MH MK ML MM MN MO MP MQ
  MR MS MT MU MV MW MX MY MZ NA
  NC NE NF NG NI NL NO NP NR NU
  NZ OM PA PE PF PG PH PK PL PM
  PN PR PS PT PW PY QA RE RO RS
  RU RW SA SB SC SD SE SG SH SI
  SJ SK SL SM SN SO SR SS ST SV
  SX SY SZ TC TD TF TG TH TJ TK
  TL TM TN TO TR TT TV TW TZ UA
  UG UM US UY UZ VA VC VE VG VI
  VN VU WF WS YE YT ZA ZM ZW
`);

/**
 * Active ISO 4217 tender currencies. CUC, HRK, SLL and ZWL are retired;
 * XDR and XSU are units of account rather than tender.
 */
const CURRENCY_CODES = splitCodes(`
  AED AFN ALL AMD ANG AOA ARS AUD AWG AZN
  BAM BBD BDT BGN BHD BIF BMD BND BOB BRL
  BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY
  COP CRC CUP CVE CZK DJF DKK DOP DZD EGP
  ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD
  GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR
  IQD IRR ISK JMD JOD JPY KES KGS KHR KMF
  KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL
  LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR
  MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR
  NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR
  RON RSD RUB RWF SAR SBD SCR SDG SEK SGD
  SHP SLE SOS SRD SSP STN SVC SYP SZL THB
  TJS TMT TND TOP TRY TTD TWD TZS UAH UGX
  USD UYU UZS VES VND VUV WST XAF XCD XCG
  XOF XPF YER ZAR ZMW ZWG
`);

const LANGUAGE_TAGS = splitCodes(`
  en en-IN en-US en-GB hi hi-IN ar ar-AE ar-SA
  fr fr-FR de de-DE es es-ES pt pt-BR ru zh-CN
  ja ko tr id th vi ms bn ur fa sw
`);

export interface CatalogSeedValueInput {
  readonly code: string;
  readonly label: string;
}

export interface ReferenceCatalogSeedValue {
  readonly catalogKey: CatalogKey;
  readonly code: string;
  readonly label: string;
  readonly sortOrder: number;
  readonly isActive: true;
  readonly metadata: Prisma.InputJsonValue;
  readonly version: number;
  readonly createdBy: string;
  readonly updatedBy: string;
}

export interface ReferenceCatalogSeedGroup {
  readonly key: CatalogKey;
  readonly values: readonly ReferenceCatalogSeedValue[];
}

export interface ReferenceCatalogSeedCatalog {
  readonly key: CatalogKey;
  readonly label: string;
  readonly description: string;
  readonly isSystem: boolean;
}

export interface ReferenceCatalogSeed {
  readonly catalogs: readonly ReferenceCatalogSeedCatalog[];
  readonly groups: readonly ReferenceCatalogSeedGroup[];
}

export class ReferenceCatalogSeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceCatalogSeedError";
  }
}

const DATE_FORMATS: readonly CatalogSeedValueInput[] = [
  { code: "DD/MM/YYYY", label: "Day/Month/Year (e.g. 31/12/2026)" },
  { code: "MM/DD/YYYY", label: "Month/Day/Year (e.g. 12/31/2026)" },
  { code: "YYYY-MM-DD", label: "ISO date (e.g. 2026-12-31)" },
];

const TIME_FORMATS: readonly CatalogSeedValueInput[] = [
  { code: "12h", label: "12-hour clock (AM / PM)" },
  { code: "24h", label: "24-hour clock" },
];

const TAX_SYSTEMS: readonly CatalogSeedValueInput[] = [
  { code: "in_gst", label: "India — GST" },
  { code: "ae_vat", label: "United Arab Emirates — VAT" },
  { code: "sa_zatca", label: "Saudi Arabia — ZATCA" },
  { code: "us_sales_tax", label: "United States — Sales tax" },
  { code: "eu_vat", label: "European Union — VAT" },
  { code: "gb_vat", label: "United Kingdom — VAT" },
  { code: "sg_gst", label: "Singapore — GST" },
  { code: "au_gst", label: "Australia — GST" },
  { code: "ca_gst_hst", label: "Canada — GST/HST" },
  { code: "nz_gst", label: "New Zealand — GST" },
];

const BRANCH_TYPES: readonly CatalogSeedValueInput[] = [
  { code: "hotel", label: "Hotel / Resort" },
  { code: "homestay", label: "Homestay / B&B" },
  { code: "restaurant", label: "Restaurant" },
  { code: "cafe", label: "Cafe / Bistro" },
  { code: "retail", label: "Retail Store" },
  { code: "warehouse", label: "Central Warehouse" },
  { code: "salon", label: "Salon / Spa" },
  { code: "office", label: "Corporate Office" },
  { code: "other", label: "Other / Custom" },
];

const BRANCH_CAPABILITIES: readonly CatalogSeedValueInput[] = [
  { code: "lodging", label: "Lodging (PMS)" },
  { code: "dining", label: "Dining (POS)" },
  { code: "retail", label: "Retail (POS)" },
  { code: "inventory", label: "Inventory" },
  { code: "events", label: "Events & Banquets" },
  { code: "wellness", label: "Spa & Wellness" },
];

const INDUSTRY_CATEGORIES: readonly CatalogSeedValueInput[] = [
  { code: "hospitality_lodging", label: "Hospitality & Lodging" },
  { code: "restaurant_food_service", label: "Restaurant & Food Service" },
  { code: "retail_ecommerce", label: "Retail & E-Commerce" },
  { code: "professional_services", label: "Professional Services & Consulting" },
  { code: "technology_software", label: "Technology & Software" },
  { code: "real_estate_property", label: "Real Estate & Property" },
  { code: "finance_fintech", label: "Finance & FinTech" },
  { code: "healthcare_medical", label: "Healthcare & Medical" },
  { code: "manufacturing_logistics", label: "Manufacturing & Logistics" },
  { code: "education_training", label: "Education & Training" },
  { code: "wellness_fitness_beauty", label: "Wellness, Fitness & Beauty" },
];

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
const CURRENCY_NAMES = new Intl.DisplayNames(["en"], { type: "currency" });
const LANGUAGE_NAMES = new Intl.DisplayNames(["en"], { type: "language" });

function displayLabel(display: Intl.DisplayNames, code: string, kind: string): string {
  const label = display.of(code);
  if (label === undefined || label.trim().length === 0) {
    throw new ReferenceCatalogSeedError(`No ${kind} label is available for "${code}".`);
  }
  return label;
}

export function normalizeCatalogSeedValues(
  key: CatalogKey,
  inputs: readonly CatalogSeedValueInput[],
): ReferenceCatalogSeedValue[] {
  const seen = new Set<string>();
  return inputs.map((input, index) => {
    const result = validateCatalogCode(key, input.code);
    if (!result.valid) {
      throw new ReferenceCatalogSeedError(`Invalid ${key} code "${input.code}": ${result.reason}`);
    }
    if (seen.has(result.normalized)) {
      throw new ReferenceCatalogSeedError(
        `Duplicate ${key} code "${result.normalized}" after normalization.`,
      );
    }
    seen.add(result.normalized);

    const label = input.label.trim();
    if (label.length === 0 || label.length > MAXIMUM_CATALOG_LABEL_LENGTH) {
      throw new ReferenceCatalogSeedError(
        `Invalid ${key} label for "${result.normalized}": labels must be 1-${MAXIMUM_CATALOG_LABEL_LENGTH} characters.`,
      );
    }

    return {
      catalogKey: key,
      code: result.normalized,
      label,
      sortOrder: (index + 1) * 10,
      isActive: true,
      metadata: {},
      version: 1,
      createdBy: CATALOG_SEED_ACTOR,
      updatedBy: CATALOG_SEED_ACTOR,
    };
  });
}

function buildCountryValues(): ReferenceCatalogSeedValue[] {
  return normalizeCatalogSeedValues(
    "country",
    COUNTRY_CODES.map((code) => ({
      code,
      label: displayLabel(REGION_NAMES, code, "country"),
    })),
  );
}

function buildCurrencyValues(): ReferenceCatalogSeedValue[] {
  return normalizeCatalogSeedValues(
    "currency",
    CURRENCY_CODES.map((code) => ({
      code,
      label: displayLabel(CURRENCY_NAMES, code, "currency"),
    })),
  );
}

function buildLanguageValues(): ReferenceCatalogSeedValue[] {
  return normalizeCatalogSeedValues(
    "language",
    LANGUAGE_TAGS.map((code) => ({
      code,
      label: displayLabel(LANGUAGE_NAMES, code, "language"),
    })),
  );
}

/** Modern IANA identifiers that this runtime still exposes under a legacy link. */
const MODERN_TIMEZONE_ALIASES = [
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Yangon",
  "Asia/Ho_Chi_Minh",
  "Europe/Kyiv",
  "America/Nuuk",
  "Atlantic/Faroe",
  "Pacific/Kanton",
] as const;

function supportedTimeZones(): readonly string[] {
  if (typeof Intl.supportedValuesOf !== "function") {
    throw new ReferenceCatalogSeedError(
      "Intl.supportedValuesOf is required to enumerate IANA time zones.",
    );
  }
  return [
    ...new Set([...Intl.supportedValuesOf("timeZone"), ...MODERN_TIMEZONE_ALIASES, "UTC"]),
  ].sort();
}

function buildTimezoneValues(): ReferenceCatalogSeedValue[] {
  return normalizeCatalogSeedValues(
    "timezone",
    supportedTimeZones().map((code) => ({ code, label: code })),
  );
}

function buildCatalogRows(): ReferenceCatalogSeedCatalog[] {
  return CATALOG_KEYS.map((key) => {
    const definition = getCatalogDefinition(key);
    return {
      key,
      label: definition.label,
      description: definition.description,
      isSystem: definition.isSystem,
    };
  });
}

export function buildReferenceCatalogSeed(): ReferenceCatalogSeed {
  return {
    catalogs: buildCatalogRows(),
    groups: [
      { key: "currency", values: buildCurrencyValues() },
      { key: "country", values: buildCountryValues() },
      { key: "language", values: buildLanguageValues() },
      { key: "timezone", values: buildTimezoneValues() },
      {
        key: "date_format",
        values: normalizeCatalogSeedValues("date_format", DATE_FORMATS),
      },
      {
        key: "time_format",
        values: normalizeCatalogSeedValues("time_format", TIME_FORMATS),
      },
      {
        key: "tax_system",
        values: normalizeCatalogSeedValues("tax_system", TAX_SYSTEMS),
      },
      {
        key: "branch_type",
        values: normalizeCatalogSeedValues("branch_type", BRANCH_TYPES),
      },
      {
        key: "branch_capability",
        values: normalizeCatalogSeedValues("branch_capability", BRANCH_CAPABILITIES),
      },
      {
        key: "industry_category",
        values: normalizeCatalogSeedValues("industry_category", INDUSTRY_CATEGORIES),
      },
    ],
  };
}
