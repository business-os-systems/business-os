import { z } from "zod";

/**
 * Result contract returned by public.cms_resolve_domain()
 */
export const ResolvedDomainSchema = z.discriminatedUnion("resolved", [
  z.object({
    resolved: z.literal(true),
    siteId: z.string(),
    title: z.string(),
    slug: z.string(),
    primaryLocale: z.string(),
    timezone: z.string(),
    brand: z.object({
      brandName: z.string(),
      brandLogoUrl: z.string().nullable().optional(),
      faviconUrl: z.string().nullable().optional(),
    }),
    themeTokens: z.record(z.unknown()),
    headerAst: z.record(z.unknown()),
    footerAst: z.record(z.unknown()),
    customCss: z.string().nullable().optional(),
    homePage: z
      .object({
        pageId: z.string(),
        slug: z.string(),
        title: z.string(),
        publishedAst: z.record(z.unknown()),
      })
      .nullable()
      .optional(),
  }),
  z.object({
    resolved: z.literal(false),
    reason: z.enum(["INVALID_HOSTNAME", "DOMAIN_NOT_FOUND", "SITE_NOT_PUBLISHED"]),
  }),
]);

export type ResolvedDomain = z.infer<typeof ResolvedDomainSchema>;

/**
 * Result contract returned by public.cms_ingest_form_submission()
 */
export const IngestFormSubmissionResultSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    submissionId: z.string(),
    isDuplicate: z.boolean(),
    createdAt: z.string().optional(),
  }),
  z.object({
    success: z.literal(false),
    errorCode: z.string(),
    message: z.string(),
  }),
]);

export type IngestFormSubmissionResult = z.infer<typeof IngestFormSubmissionResultSchema>;
