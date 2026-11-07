/**
 * Operational catalog vocabulary shared by the API contract, the compiled
 * registry and the Platform UI. One definition prevents silent drift.
 */
export const APP_CATALOG_AVAILABILITIES = [
  "HIDDEN",
  "PREVIEW",
  "AVAILABLE",
  "RETIRED",
] as const;

export type AppCatalogAvailability =
  (typeof APP_CATALOG_AVAILABILITIES)[number];

/** The largest display order the catalog override accepts. */
export const MAX_CATALOG_SORT_ORDER = 10_000;
