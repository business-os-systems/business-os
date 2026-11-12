import { z } from "zod";
import { MediaAssetMapSchema } from "@suite/website-builder/ast";
import { AppearanceTokensSchema } from "@suite/website-builder/appearance";

/**
 * Client-side mirror of the portable site export document
 * (format business-os.website-builder.site version 1, SC-012). The API is the
 * producer; the dashboard validates the file before saving it so a broken
 * export is never offered as a download.
 */

export const SITE_EXPORT_FORMAT = {
  id: "business-os.website-builder.site",
  version: 1,
} as const;

const exportAstSchema = z.record(z.string(), z.unknown());

const exportedSiteSchema = z
  .object({
    title: z.string(),
    slug: z.string(),
    status: z.string(),
    timezone: z.string(),
    primaryLocale: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const exportedAppearanceSchema = z
  .object({
    brandName: z.string(),
    brandLogoUrl: z.string().nullable(),
    draftTokens: AppearanceTokensSchema,
    publishedTokens: AppearanceTokensSchema,
    sourceItemId: z.string().nullable(),
    sourceVersion: z.number().int().nullable(),
    version: z.number().int(),
    publishedAt: z.string().datetime(),
  })
  .strict();

const exportedSiteSettingsSchema = z
  .object({
    faviconUrl: z.string().nullable(),
    brandLogoUrl: z.string().nullable(),
    brandName: z.string().nullable(),
    headerAst: exportAstSchema,
    footerAst: exportAstSchema,
    customCss: z.string().nullable(),
    customHeadCode: z.string().nullable(),
  })
  .strict();

const exportedDomainSchema = z
  .object({
    hostname: z.string(),
    isPrimary: z.boolean(),
    isSubdomain: z.boolean(),
    status: z.string(),
  })
  .strict();

const exportedRedirectSchema = z
  .object({
    sourcePath: z.string(),
    targetUrl: z.string(),
    type: z.string(),
  })
  .strict();

const exportedPageSchema = z
  .object({
    title: z.string(),
    path: z.string(),
    parentPath: z.string().nullable(),
    orderIndex: z.number().int(),
    status: z.string(),
    isHomePage: z.boolean(),
    revision: z.number().int(),
    draftAst: exportAstSchema,
    publishedAst: exportAstSchema.nullable(),
  })
  .strict();

export const siteExportDocumentSchema = z
  .object({
    format: z.literal(SITE_EXPORT_FORMAT.id),
    formatVersion: z.literal(SITE_EXPORT_FORMAT.version),
    exportedAt: z.string().datetime(),
    site: exportedSiteSchema,
    appearance: exportedAppearanceSchema.nullable(),
    settings: exportedSiteSettingsSchema.nullable(),
    domains: z.array(exportedDomainSchema),
    redirects: z.array(exportedRedirectSchema),
    pages: z.array(exportedPageSchema),
    media: MediaAssetMapSchema,
  })
  .strict();

export const siteExportEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: z.object({ export: siteExportDocumentSchema }).strict(),
    requestId: z.string(),
    timestamp: z.string(),
  })
  .strict();

export type SiteExportDocument = z.infer<typeof siteExportDocumentSchema>;
