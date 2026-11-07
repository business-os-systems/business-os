import { z } from "zod";
import {
  APP_CATALOG_AVAILABILITIES,
  MAX_CATALOG_SORT_ORDER,
  type AppCatalogAvailability,
} from "@suite/core";

/**
 * The shared catalog vocabulary lives in @suite/core so the API contract and
 * the Platform UI cannot drift. The contract test still proves it matches the
 * PlatformAppAvailability database enum.
 */
export {
  APP_CATALOG_AVAILABILITIES,
  MAX_CATALOG_SORT_ORDER,
  type AppCatalogAvailability,
};

/** A registry app with no stored override is available by default. */
export const DEFAULT_APP_CATALOG_AVAILABILITY: AppCatalogAvailability =
  "AVAILABLE";

const appIdSchema = z.string().trim().min(1).max(64);

const categorySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9][a-z0-9_-]*$/,
    "Use a lower-case slug: letters, digits, underscore or hyphen."
  );

export const appCatalogParamsSchema = z.object({
  appId: appIdSchema,
});

export const catalogAppSchema = z
  .object({
    appId: appIdSchema,
    name: z.string().min(1).max(191),
    title: z.string().min(1).max(191),
    description: z.string().min(1).max(1000),
    category: z.string().min(1).max(64).nullable(),
    availability: z.enum(APP_CATALOG_AVAILABILITIES),
    sortOrder: z.number().int().min(0).max(MAX_CATALOG_SORT_ORDER),
    installedCount: z.number().int().nonnegative(),
    // Null until the first override exists; the version is the UTC update time.
    version: z.string().min(1).max(64).nullable(),
    updatedAt: z.string().datetime().nullable(),
  })
  .strict();

export const catalogListSchema = z
  .object({ apps: z.array(catalogAppSchema) })
  .strict();

export const updateAppCatalogBodySchema = z
  .object({
    availability: z.enum(APP_CATALOG_AVAILABILITIES).optional(),
    sortOrder: z.number().int().min(0).max(MAX_CATALOG_SORT_ORDER).optional(),
    category: categorySchema.nullable().optional(),
    // null on the first override, the observed token afterwards (FR-114).
    expectedVersion: z.string().min(1).max(64).nullable(),
  })
  .strict()
  .refine(
    (body) =>
      body.availability !== undefined ||
      body.sortOrder !== undefined ||
      body.category !== undefined,
    { message: "Provide at least one of availability, sortOrder or category." }
  );

export type CatalogApp = z.infer<typeof catalogAppSchema>;
export type CatalogList = z.infer<typeof catalogListSchema>;
export type UpdateAppCatalogBody = z.infer<typeof updateAppCatalogBodySchema>;
