import { z } from "zod";
import { BlockAstSchema, PageAstSchema } from "@suite/website-builder/ast";
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
export { APP_CATALOG_AVAILABILITIES, MAX_CATALOG_SORT_ORDER, type AppCatalogAvailability };

/** A registry app with no stored override is available by default. */
export const DEFAULT_APP_CATALOG_AVAILABILITY: AppCatalogAvailability = "AVAILABLE";

const appIdSchema = z.string().trim().min(1).max(64);

const categorySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "Use a lower-case slug: letters, digits, underscore or hyphen.");

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

export const catalogListSchema = z.object({ apps: z.array(catalogAppSchema) }).strict();

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
    { message: "Provide at least one of availability, sortOrder or category." },
  );

export type CatalogApp = z.infer<typeof catalogAppSchema>;
export type CatalogList = z.infer<typeof catalogListSchema>;
export type UpdateAppCatalogBody = z.infer<typeof updateAppCatalogBodySchema>;

// ==============================================================================
// Website Builder application catalog (P-03, #342)
//
// The catalog vocabulary is repeated here as a tuple rather than imported from
// Prisma so the HTTP contract has no database dependency; the contract test
// proves it still matches the database enum (same pattern as the app registry).
// ==============================================================================

export const CATALOG_ITEM_KINDS = ["SECTION", "TEMPLATE", "THEME"] as const;
export const CATALOG_ITEM_SCOPES = ["GLOBAL", "TENANT"] as const;
export const CATALOG_ITEM_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "DEPRECATED",
  "DISABLED",
  "RETIRED",
] as const;

export type CatalogItemKind = (typeof CATALOG_ITEM_KINDS)[number];
export type CatalogItemScope = (typeof CATALOG_ITEM_SCOPES)[number];
export type CatalogItemStatus = (typeof CATALOG_ITEM_STATUSES)[number];

/** Cursor pagination hard cap and stable sort: updatedAt then id (CT-5). */
export const CATALOG_LIST_LIMIT = { default: 20, max: 100 } as const;

/** Every catalog item declares the contract version it was authored against. */
export const DEFAULT_CATALOG_CONTRACT_VERSION = "2026-03";

/** Signed preview references are short-lived and bound to one definition hash. */
export const CATALOG_PREVIEW_TTL_SECONDS = 900;

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "Use a lower-case slug: letters, digits, underscore or hyphen.");

const contractVersionSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^\d{4}-\d{2}$/, "Contract version must be a YYYY-MM reference such as 2026-03.");

const flagKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9_.-]+$/,
    "Flag key must be lowercase letters, digits, dots, underscores or hyphens.",
  );

const organizationIdSchema = z.string().trim().min(1).max(64);

export const catalogTargetingSchema = z
  .object({
    plans: z.array(slugSchema).max(50).default([]),
    industries: z.array(slugSchema).max(50).default([]),
    orgAllowlist: z.array(organizationIdSchema).max(200).default([]),
    orgDenylist: z.array(organizationIdSchema).max(200).default([]),
  })
  .strict();

// These schemas are the service-side source of truth; they never reach
// OpenAPI (the wire bodies document definitions as JSON objects).
const sectionDefinitionSchema = z
  .object({
    schemaVersion: contractVersionSchema,
    block: BlockAstSchema,
  })
  .strict();

const templateDefinitionSchema = z
  .object({
    schemaVersion: contractVersionSchema,
    pages: z.array(PageAstSchema).min(1).max(20),
  })
  .strict();

const themeDefinitionSchema = z
  .object({
    schemaVersion: contractVersionSchema,
    tokens: z.record(z.union([z.string().max(200), z.number()])),
  })
  .strict();

const CATALOG_DEFINITION_SCHEMAS = {
  SECTION: sectionDefinitionSchema,
  TEMPLATE: templateDefinitionSchema,
  THEME: themeDefinitionSchema,
} as const satisfies Record<CatalogItemKind, z.ZodTypeAny>;

export function catalogDefinitionSchemaFor(kind: CatalogItemKind): z.ZodTypeAny {
  return CATALOG_DEFINITION_SCHEMAS[kind];
}

/**
 * Upper bounds for one stored definition. A definition is operator-supplied
 * JSON that reaches the database and the renderer, so both its nesting and its
 * encoded size are capped at the boundary that stores it (FR-147, FR-148).
 */
export const CATALOG_DEFINITION_LIMITS = {
  maxBytes: 1_048_576,
  maxDepth: 64,
} as const;

/**
 * Keys that can rewrite an object's prototype when a consumer copies the
 * payload. No catalog definition declares them, so they are always refused.
 */
const FORBIDDEN_DEFINITION_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function inspectDefinitionShape(value: unknown, depth: number): string | null {
  if (depth > CATALOG_DEFINITION_LIMITS.maxDepth) {
    return "Definition nesting exceeds " + CATALOG_DEFINITION_LIMITS.maxDepth + " levels.";
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const issue = inspectDefinitionShape(entry, depth + 1);
      if (issue !== null) {
        return issue;
      }
    }
    return null;
  }
  if (value === null || typeof value !== "object") {
    return null;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_DEFINITION_KEYS.has(key)) {
      return 'Definition property "' + key + '" is not allowed.';
    }
    const issue = inspectDefinitionShape(entry, depth + 1);
    if (issue !== null) {
      return issue;
    }
  }
  return null;
}

function inspectDefinitionSize(value: unknown): string | null {
  if (value === undefined) {
    return "The definition must be a JSON object.";
  }
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, "utf8") > CATALOG_DEFINITION_LIMITS.maxBytes) {
    return "Definition exceeds " + CATALOG_DEFINITION_LIMITS.maxBytes + " encoded bytes.";
  }
  return null;
}

const definitionBoundsSchema = z.unknown().superRefine((value, ctx) => {
  const issue = inspectDefinitionShape(value, 0) ?? inspectDefinitionSize(value);
  if (issue !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue });
  }
});

/** One validated definition per kind; unknown properties are rejected (FR-147). */
export function validateCatalogDefinition(
  kind: CatalogItemKind,
  definition: unknown,
): { success: true; data: unknown } | { success: false; issues: z.ZodIssue[] } {
  const bounded = definitionBoundsSchema.safeParse(definition);
  if (!bounded.success) {
    return { success: false, issues: bounded.error.issues };
  }
  const result = catalogDefinitionSchemaFor(kind).safeParse(definition);
  if (!result.success) {
    return { success: false, issues: result.error.issues };
  }
  return { success: true, data: result.data };
}

const createCatalogItemBase = {
  name: z.string().trim().min(1).max(191),
  slug: slugSchema,
  category: slugSchema,
  industries: z.array(slugSchema).max(50).default([]),
  contractVersion: contractVersionSchema.default(DEFAULT_CATALOG_CONTRACT_VERSION),
  flagKey: flagKeySchema.nullable().default(null),
  targeting: catalogTargetingSchema.default({
    plans: [],
    industries: [],
    orgAllowlist: [],
    orgDenylist: [],
  }),
};

/**
 * The wire body keeps the definition as a JSON object because the AST schemas
 * are recursive and cannot be represented in OpenAPI. The service validates the
 * definition against its kind schema before storage, so an undeclared property
 * is still rejected at the boundary that matters (FR-147, FR-148).
 */
export const createCatalogItemBodySchema = z
  .object({
    kind: z.enum(CATALOG_ITEM_KINDS),
    ...createCatalogItemBase,
    definition: z.record(z.unknown()),
  })
  .strict();

export const updateCatalogItemBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(191).optional(),
    slug: slugSchema.optional(),
    category: slugSchema.optional(),
    industries: z.array(slugSchema).max(50).optional(),
    definition: z.record(z.unknown()).optional(),
    contractVersion: contractVersionSchema.optional(),
    flagKey: flagKeySchema.nullable().optional(),
    targeting: catalogTargetingSchema.optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.name !== undefined ||
      body.slug !== undefined ||
      body.category !== undefined ||
      body.industries !== undefined ||
      body.definition !== undefined ||
      body.contractVersion !== undefined ||
      body.flagKey !== undefined ||
      body.targeting !== undefined,
    { message: "Provide at least one catalog item field to change." },
  );

export const publishCatalogItemBodySchema = z
  .object({
    version: z.number().int().positive(),
    changeNote: z.string().trim().max(500).optional(),
    targeting: catalogTargetingSchema.optional(),
  })
  .strict();

export const catalogItemParamsSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

export const listCatalogItemsQuerySchema = z
  .object({
    kind: z.enum(CATALOG_ITEM_KINDS).optional(),
    status: z.enum(CATALOG_ITEM_STATUSES).optional(),
    cursor: z.string().trim().min(1).max(512).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(CATALOG_LIST_LIMIT.max)
      .default(CATALOG_LIST_LIMIT.default),
  })
  .strict();

export const listCatalogItemVersionsQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(512).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(CATALOG_LIST_LIMIT.max)
      .default(CATALOG_LIST_LIMIT.default),
  })
  .strict();

export const catalogItemSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(CATALOG_ITEM_KINDS),
    scope: z.enum(CATALOG_ITEM_SCOPES),
    organizationId: z.string().min(1).nullable(),
    name: z.string().min(1),
    slug: z.string().min(1),
    category: z.string().min(1),
    industries: z.array(z.string()),
    definition: z.record(z.unknown()),
    previewRef: z.string().nullable(),
    flagKey: z.string().nullable(),
    targeting: catalogTargetingSchema,
    status: z.enum(CATALOG_ITEM_STATUSES),
    contractVersion: z.string().min(1),
    currentVersion: z.number().int().nonnegative(),
    draftVersion: z.number().int().positive().nullable(),
    concurrencyVersion: z.number().int().positive(),
    previewedAt: z.string().datetime().nullable(),
    publishedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const catalogItemPageSchema = z
  .object({
    items: z.array(catalogItemSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const catalogItemVersionSchema = z
  .object({
    id: z.string().min(1),
    itemId: z.string().min(1),
    version: z.number().int().positive(),
    definition: z.record(z.unknown()),
    status: z.enum(CATALOG_ITEM_STATUSES),
    contractVersion: z.string().min(1),
    changeNote: z.string().nullable(),
    previewedAt: z.string().datetime().nullable(),
    publishedAt: z.string().datetime(),
    publishedBy: z.string().min(1),
    createdAt: z.string().datetime(),
  })
  .strict();

export const catalogItemVersionPageSchema = z
  .object({
    versions: z.array(catalogItemVersionSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const catalogPreviewPayloadSchema = z
  .object({
    itemId: z.string().min(1).max(64),
    version: z.number().int().positive(),
    definitionHash: z.string().length(64),
    expiresAt: z.string().datetime(),
  })
  .strict();

export const catalogPreviewSchema = z
  .object({
    previewRef: z.string().min(1),
    expiresAt: z.string().datetime(),
    version: z.number().int().positive(),
    definitionHash: z.string().length(64),
  })
  .strict();

export type CatalogTargeting = z.infer<typeof catalogTargetingSchema>;
export type CreateCatalogItemBody = z.infer<typeof createCatalogItemBodySchema>;
export type UpdateCatalogItemBody = z.infer<typeof updateCatalogItemBodySchema>;
export type PublishCatalogItemBody = z.infer<typeof publishCatalogItemBodySchema>;
export type ListCatalogItemsQuery = z.infer<typeof listCatalogItemsQuerySchema>;
export type ListCatalogItemVersionsQuery = z.infer<typeof listCatalogItemVersionsQuerySchema>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type CatalogItemPage = z.infer<typeof catalogItemPageSchema>;
export type CatalogItemVersion = z.infer<typeof catalogItemVersionSchema>;
export type CatalogItemVersionPage = z.infer<typeof catalogItemVersionPageSchema>;
export type CatalogPreview = z.infer<typeof catalogPreviewSchema>;
export type CatalogPreviewPayload = z.infer<typeof catalogPreviewPayloadSchema>;
