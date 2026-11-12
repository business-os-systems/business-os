import { z } from "zod";
import { SITE_IDEMPOTENCY_KEY_PATTERN } from "@suite/website-builder/services";
import {
  AppearanceTokenPatchSchema,
  BRAND_LOGO_URL_MAX_LENGTH,
  isSafeBrandLogoUrl,
  type AppearanceTokens,
} from "@suite/website-builder/appearance";
import {
  BlockAstSchema,
  MediaAssetMapSchema,
  PageAstSchema,
} from "@suite/website-builder/ast";

/** Cursor pagination hard caps for the CMS tenant routes (CT-5). */
export const CMS_PAGE_LIMIT = { default: 20, max: 100 } as const;
export const CMS_PAGE_TREE_LIMIT = { default: 200, max: 200 } as const;
export const CMS_TEMPLATE_LIMIT = { default: 50, max: 100 } as const;
export const CMS_THEME_LIMIT = { default: 50, max: 100 } as const;
export const CMS_VERSION_LIMIT = { default: 20, max: 50 } as const;

/** Idempotency-Key format shared with every create-site surface (CT-4). */
export const CMS_IDEMPOTENCY_KEY_PATTERN = SITE_IDEMPOTENCY_KEY_PATTERN;

export const siteParamsSchema = z.object({
  siteId: z.string().trim().min(1).max(64),
});

export const pageParamsSchema = z.object({
  pageId: z.string().trim().min(1).max(64),
});

export const inquiryIdParamsSchema = z.object({
  inquiryId: z.string().trim().min(1).max(64),
});

export const listSitesQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(CMS_PAGE_LIMIT.max).default(CMS_PAGE_LIMIT.default),
});

export const listPagesQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CMS_PAGE_TREE_LIMIT.max)
    .default(CMS_PAGE_TREE_LIMIT.default),
});


export const listRedirectsQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(CMS_PAGE_LIMIT.max).default(CMS_PAGE_LIMIT.default),
});

export interface CmsRedirectRecord {
  readonly id: string;
  readonly siteId: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly type: string;
  readonly createdAt: string;
}

export const reviewParamsSchema = z.object({
  siteId: z.string().trim().min(1).max(64),
  reviewId: z.string().trim().min(1).max(64),
});

export const reviewPageParamsSchema = z.object({
  siteId: z.string().trim().min(1).max(64),
  reviewId: z.string().trim().min(1).max(64),
  pageId: z.string().trim().min(1).max(64),
});

export const publishBodySchema = z
  .object({
    reviewId: z.string().trim().min(1).max(64),
    changeNote: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export const versionParamsSchema = z.object({
  pageId: z.string().trim().min(1).max(64),
  versionNumber: z.coerce.number().int().positive(),
});

export const listVersionsQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CMS_VERSION_LIMIT.max)
    .default(CMS_VERSION_LIMIT.default),
});

export const restoreVersionBodySchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();

/**
 * Contract 2026-03 revision: creation accepts a published catalog templateId
 * (or null for a blank home page); the legacy initialTemplate enum is gone
 * (FR-017, FR-019).
 */
export const createSiteBodySchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    slug: z.string().trim().min(1).max(63),
    templateId: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .strict();

export const createPageBodySchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    path: z.string().trim().min(1).max(191),
    parentId: z.string().trim().min(1).max(64).nullable().optional(),
    isHomePage: z.boolean().optional(),
  })
  .strict();

export const updatePageBodySchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    path: z.string().trim().min(1).max(191).optional(),
    parentId: z.string().trim().min(1).max(64).nullable().optional(),
    expectedRevision: z.number().int().positive(),
  })
  .strict()
  .refine(
    (body) => body.title !== undefined || body.path !== undefined || body.parentId !== undefined,
    { message: "Provide at least one of title, path or parentId." }
  );

/** Moves a page one slot among its siblings (FR-020, FR-080). */
export const reorderPageBodySchema = z
  .object({
    direction: z.enum(["up", "down"]),
    expectedRevision: z.number().int().positive(),
  })
  .strict();

/** Archives a page without destroying its content or its address (FR-020). */
export const archivePageBodySchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();

const brandNameSchema = z.string().trim().min(1).max(191);

/**
 * A logo is either a workspace-relative media path or an absolute HTTPS URL.
 * Data URLs, javascript: and protocol-relative values are refused so the value
 * can be embedded in an <img src> without becoming an injection sink.
 */
const brandLogoUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(BRAND_LOGO_URL_MAX_LENGTH)
  .refine(isSafeBrandLogoUrl, {
    message: "Use a workspace path or an absolute HTTPS URL.",
  });

export const updateAppearanceBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    tokens: AppearanceTokenPatchSchema.optional(),
    brandName: brandNameSchema.optional(),
    brandLogoUrl: brandLogoUrlSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.tokens !== undefined ||
      body.brandName !== undefined ||
      body.brandLogoUrl !== undefined,
    { message: "Provide at least one of tokens, brandName or brandLogoUrl." }
  );

export const selectAppearanceThemeBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    catalogItemId: z.string().trim().min(1).max(64),
  })
  .strict();

export const appearanceVersionBodySchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export type UpdateAppearanceBody = z.infer<typeof updateAppearanceBodySchema>;
export type SelectAppearanceThemeBody = z.infer<typeof selectAppearanceThemeBodySchema>;
export type AppearanceVersionBody = z.infer<typeof appearanceVersionBodySchema>;

export type CreateSiteBody = z.infer<typeof createSiteBodySchema>;
export type CreatePageBody = z.infer<typeof createPageBodySchema>;
export type UpdatePageBody = z.infer<typeof updatePageBodySchema>;
export type ReorderPageBody = z.infer<typeof reorderPageBodySchema>;
export type ArchivePageBody = z.infer<typeof archivePageBodySchema>;
export type PublishBody = z.infer<typeof publishBodySchema>;
export type RestoreVersionBody = z.infer<typeof restoreVersionBodySchema>;

export interface CmsSiteRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly branchId: string | null;
  readonly title: string;
  readonly slug: string;
  readonly status: string;
  readonly timezone: string;
  readonly primaryLocale: string;
  readonly pagesCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CmsPageRecord {
  readonly id: string;
  readonly siteId: string;
  readonly parentId: string | null;
  readonly title: string;
  readonly path: string;
  readonly orderIndex: number;
  readonly status: string;
  readonly isHomePage: boolean;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CmsTemplateRecord {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly category: string;
  readonly industries: string[];
  readonly currentVersion: number;
  readonly previewRef: string | null;
}

export interface CmsAppearanceRecord {
  readonly siteId: string;
  readonly brandName: string;
  readonly brandLogoUrl: string | null;
  readonly draftTokens: AppearanceTokens;
  readonly publishedTokens: AppearanceTokens;
  readonly sourceItemId: string | null;
  readonly sourceVersion: number | null;
  readonly version: number;
  readonly publishedAt: string;
  readonly hasUnpublishedChanges: boolean;
}

export interface CmsThemeRecord {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly category: string;
  readonly industries: string[];
  readonly currentVersion: number;
  readonly previewRef: string | null;
  readonly tokens: AppearanceTokens;
}

export interface CmsList<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

// ==============================================================================
// Page content and tenant-visible catalog (T-05, #350)
//
// The AST contract is imported from the renderer package so the API, the editor
// and the production renderer validate one schema (FR-024, CT-3).
// ==============================================================================

/** OpenAPI renders the recursive AST as JSON; services validate with PageAstSchema. */
const pageAstJsonSchema = z.record(z.string(), z.unknown()) as unknown as typeof PageAstSchema;
const blockAstJsonSchema = z.record(z.string(), z.unknown()) as unknown as typeof BlockAstSchema;

export const pageContentSchema = z
  .object({
    pageId: z.string().min(1).max(64),
    revision: z.number().int().positive(),
    draftAst: pageAstJsonSchema,
    publishedAst: pageAstJsonSchema.nullable(),
    /** Server-resolved asset URLs used by the renderer; never stored in the AST. */
    media: MediaAssetMapSchema,
    updatedAt: z.string().datetime(),
    lastEditedByUserId: z.string().min(1).max(191).nullable(),
    lastEditedAt: z.string().datetime().nullable(),
  })
  .strict();

export const savePageContentBodySchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    draftAst: pageAstJsonSchema,
  })
  .strict();

export const pageContentResultSchema = z.object({ content: pageContentSchema }).strict();

/** Strict service-side validation for a catalog section definition. */
export const catalogSectionDefinitionValidationSchema = z
  .object({
    schemaVersion: z.string().min(1).max(32),
    block: BlockAstSchema,
  })
  .strict();

/** Wire/OpenAPI shape: the AST is documented as JSON, validated before use. */
export const catalogSectionDefinitionSchema = z
  .object({
    schemaVersion: z.string().min(1).max(32),
    block: blockAstJsonSchema,
  })
  .strict();

export const catalogSectionSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(191),
    slug: z.string().min(1).max(191),
    category: z.string().min(1).max(64),
    industries: z.array(z.string().min(1).max(64)).max(50),
    currentVersion: z.number().int().positive(),
    previewRef: z.string().max(2048).nullable(),
    definition: catalogSectionDefinitionSchema,
  })
  .strict();

export const catalogSectionsResultSchema = z
  .object({ items: z.array(catalogSectionSchema).max(CMS_PAGE_LIMIT.max) })
  .strict();

export const listCatalogSectionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(CMS_PAGE_LIMIT.max).default(CMS_PAGE_LIMIT.default),
});

export type PageContent = z.infer<typeof pageContentSchema>;
export type SavePageContentBody = z.infer<typeof savePageContentBodySchema>;
export type CatalogSection = z.infer<typeof catalogSectionSchema>;
export type ListCatalogSectionsQuery = z.infer<typeof listCatalogSectionsQuerySchema>;

