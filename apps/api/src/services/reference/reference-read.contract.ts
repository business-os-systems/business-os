import { CATALOG_KEYS } from "@suite/core";
import { z } from "zod";

/**
 * The reference read contract (FR-105, FR-112, CT-7).
 *
 * Every application reads these vocabularies through this shape. The values are
 * database-owned; this module only describes the transport. Retired values are
 * never returned here — only the Platform editor sees them (#232), so a retired
 * code cannot be selected again while existing records stay readable (FR-104).
 */

export const catalogMetadataSchema = z.record(
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const referenceValueSchema = z
  .object({
    code: z.string().min(1).max(64),
    label: z.string().min(1).max(191),
    sortOrder: z.number().int().nonnegative(),
    metadata: catalogMetadataSchema,
  })
  .strict();

export const referenceCatalogSchema = z
  .object({
    key: z.enum(CATALOG_KEYS),
    label: z.string().min(1).max(100),
    description: z.string().nullable(),
    values: z.array(referenceValueSchema),
  })
  .strict();

export const referenceCatalogListSchema = z
  .object({
    catalogs: z.array(referenceCatalogSchema),
    asOf: z.string().datetime(),
  })
  .strict();

export const referenceCatalogResponseSchema = z
  .object({
    catalog: referenceCatalogSchema,
    asOf: z.string().datetime(),
  })
  .strict();

export const referenceCatalogParamsSchema = z.object({
  key: z.string().trim().min(1).max(64),
});

export type ReferenceValue = z.infer<typeof referenceValueSchema>;
export type ReferenceCatalog = z.infer<typeof referenceCatalogSchema>;
export type ReferenceCatalogList = z.infer<typeof referenceCatalogListSchema>;
export type ReferenceCatalogResponse = z.infer<typeof referenceCatalogResponseSchema>;
