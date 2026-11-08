import { MAX_CATALOG_SORT_ORDER } from "@suite/core";
import { z } from "zod";

const codeSchema = z.string().trim().min(1).max(64);
const labelSchema = z.string().trim().min(1).max(191);
const sortOrderSchema = z.number().int().min(0).max(MAX_CATALOG_SORT_ORDER);
const expectedVersionSchema = z.number().int().positive();

/**
 * Catalog metadata is a flat JSON object of scalar values. Keeping it flat
 * makes the OpenAPI contract representable and bounds the stored document;
 * nested structures belong in a dedicated catalog field, not metadata.
 */
const FORBIDDEN_METADATA_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAXIMUM_METADATA_BYTES = 4096;

export const catalogMetadataSchema = z
  .unknown()
  .superRefine((value, ctx) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Metadata must be a JSON object.",
      });
      return;
    }
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_METADATA_KEYS.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Metadata key "${key}" is not allowed.`,
          path: [key],
        });
      }
    }
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAXIMUM_METADATA_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Metadata must be at most ${MAXIMUM_METADATA_BYTES} bytes.`,
      });
    }
  })
  .pipe(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])));

export const catalogParamsSchema = z.object({
  category: z.string().trim().min(1).max(64),
});

export const catalogValueParamsSchema = z.object({
  category: z.string().trim().min(1).max(64),
  code: codeSchema,
});

export const createCatalogValueBodySchema = z
  .object({
    code: codeSchema,
    label: labelSchema,
    sortOrder: sortOrderSchema.optional(),
    metadata: catalogMetadataSchema.optional(),
  })
  .strict();

export const updateCatalogValueBodySchema = z
  .object({
    label: labelSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
    metadata: catalogMetadataSchema.optional(),
    expectedVersion: expectedVersionSchema,
  })
  .strict()
  .refine(
    (body) =>
      body.label !== undefined ||
      body.sortOrder !== undefined ||
      body.isActive !== undefined ||
      body.metadata !== undefined,
    {
      message: "Provide at least one of label, sortOrder, isActive or metadata.",
    },
  );

export const catalogValueSchema = z
  .object({
    catalogKey: z.string().min(1).max(64),
    code: z.string().min(1).max(64),
    label: z.string().min(1).max(191),
    sortOrder: z.number().int().min(0).max(MAX_CATALOG_SORT_ORDER),
    isActive: z.boolean(),
    metadata: catalogMetadataSchema,
    version: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const catalogSchema = z
  .object({
    key: z.string().min(1).max(64),
    label: z.string().min(1).max(100),
    description: z.string().nullable(),
    isSystem: z.boolean(),
    values: z.array(catalogValueSchema),
  })
  .strict();

export const catalogListSchema = z.object({ catalogs: z.array(catalogSchema) }).strict();

export type CatalogValue = z.infer<typeof catalogValueSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogList = z.infer<typeof catalogListSchema>;
export type CreateCatalogValueBody = z.infer<typeof createCatalogValueBodySchema>;
export type UpdateCatalogValueBody = z.infer<typeof updateCatalogValueBodySchema>;
