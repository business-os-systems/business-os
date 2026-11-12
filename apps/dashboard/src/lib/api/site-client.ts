import { z } from "zod";
import {
  CmsApiError,
  cmsEnvelopeSchema,
  cmsProblemSchema,
  requestCmsJson,
  type CmsProblem,
} from "./cms-http";
import {
  AppearanceTokensSchema,
  type AppearanceTokenPatch,
} from "@suite/website-builder/appearance";
import {
  siteExportEnvelopeSchema,
  type SiteExportDocument,
} from "./site-export.contract";

export { CmsApiError };
export type { CmsProblem } from "./cms-http";

/** Alias used by the editor transport; one HTTP implementation, not two. */
export const cmsRequest = requestCmsJson;

/** Parses an RFC 7807 problem document from a failed response. */
export async function readCmsProblem(response: Response): Promise<CmsProblem> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = cmsProblemSchema.safeParse(body);
  if (parsed.success) {
    return parsed.data;
  }
  return {
    type: "/errors/cms-request-failed",
    title: "Request failed",
    status: response.status,
    detail:
      "The server returned HTTP " + String(response.status) + " without a problem document.",
    code: "NETWORK_ERROR",
  };
}

/** Presents the server's RFC 7807 detail instead of a generic network message. */
export function describeCmsError(error: unknown): string {
  if (error instanceof CmsApiError) {
    return error.problem.detail;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

const siteSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  branchId: z.string().nullable(),
  title: z.string(),
  slug: z.string(),
  status: z.string(),
  timezone: z.string(),
  primaryLocale: z.string(),
  pagesCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const pageSchema = z.object({
  id: z.string(),
  siteId: z.string(),
  parentId: z.string().nullable(),
  title: z.string(),
  path: z.string(),
  orderIndex: z.number().int(),
  status: z.string(),
  isHomePage: z.boolean(),
  revision: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const templateSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  category: z.string(),
  industries: z.array(z.string()),
  currentVersion: z.number().int(),
  previewRef: z.string().nullable(),
});

const siteListSchema = cmsEnvelopeSchema(
  z.object({ items: z.array(siteSchema), nextCursor: z.string().nullable() })
);
const pageListSchema = cmsEnvelopeSchema(
  z.object({ items: z.array(pageSchema), nextCursor: z.string().nullable() })
);
const redirectSchema = z.object({
  id: z.string(),
  siteId: z.string(),
  sourcePath: z.string(),
  targetPath: z.string(),
  type: z.string(),
  createdAt: z.string(),
});

const redirectListSchema = cmsEnvelopeSchema(
  z.object({ items: z.array(redirectSchema), nextCursor: z.string().nullable() })
);

const templateListSchema = cmsEnvelopeSchema(z.object({ items: z.array(templateSchema) }));
const previewLinkSchema = cmsEnvelopeSchema(
  z.object({ preview: z.object({ url: z.string().url(), expiresAt: z.string() }).strict() })
);
const siteResultSchema = cmsEnvelopeSchema(z.object({ site: siteSchema }));
const pageResultSchema = cmsEnvelopeSchema(z.object({ page: pageSchema }));
const createSiteSchema = cmsEnvelopeSchema(
  z.object({
    site: siteSchema,
    homePage: z.object({ id: z.string(), title: z.string(), path: z.string() }),
    pageCount: z.number().int(),
    replayed: z.boolean(),
  })
);
export type CmsSiteDto = z.infer<typeof siteSchema>;
export type CmsRedirectDto = z.infer<typeof redirectSchema>;
export type CmsPageDto = z.infer<typeof pageSchema>;
export type CmsTemplateDto = z.infer<typeof templateSchema>;
export type CreateSiteResult = z.infer<typeof createSiteSchema>["data"];

const appearanceSchema = z.object({
  siteId: z.string(),
  brandName: z.string(),
  brandLogoUrl: z.string().nullable(),
  draftTokens: AppearanceTokensSchema,
  publishedTokens: AppearanceTokensSchema,
  sourceItemId: z.string().nullable(),
  sourceVersion: z.number().int().nullable(),
  version: z.number().int(),
  publishedAt: z.string(),
  hasUnpublishedChanges: z.boolean(),
});

const appearanceThemeSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  category: z.string(),
  industries: z.array(z.string()),
  currentVersion: z.number().int(),
  previewRef: z.string().nullable(),
  tokens: AppearanceTokensSchema,
});

const appearanceThemeListSchema = cmsEnvelopeSchema(
  z.object({ items: z.array(appearanceThemeSchema) })
);
const appearanceResultSchema = cmsEnvelopeSchema(z.object({ appearance: appearanceSchema }));

export type CmsAppearanceDto = z.infer<typeof appearanceSchema>;
export type CmsAppearanceThemeDto = z.infer<typeof appearanceThemeSchema>;

export interface AppearanceUpdateInput {
  readonly expectedVersion: number;
  readonly tokens?: AppearanceTokenPatch;
  readonly brandName?: string;
  readonly brandLogoUrl?: string | null;
}

export interface AppearanceThemeInput {
  readonly expectedVersion: number;
  readonly catalogItemId: string;
}

const CMS_BASE = "/api/v1/cms";

export async function listSiteTemplates(): Promise<CmsTemplateDto[]> {
  const response = await requestCmsJson(CMS_BASE + "/templates", templateListSchema, { method: "GET" });
  return response.data.items;
}

const SITE_SWITCHER_LIMIT = 100;

export async function listSites(
  limit = SITE_SWITCHER_LIMIT
): Promise<{ items: CmsSiteDto[]; nextCursor: string | null }> {
  const query = new URLSearchParams({ limit: String(limit) });
  const response = await requestCmsJson(CMS_BASE + "/sites?" + query.toString(), siteListSchema, {
    method: "GET",
  });
  return response.data;
}

export async function getSite(siteId: string): Promise<CmsSiteDto> {
  const response = await requestCmsJson(
    CMS_BASE + "/sites/" + encodeURIComponent(siteId),
    siteResultSchema,
    { method: "GET" }
  );
  return response.data.site;
}

export async function listSitePages(siteId: string): Promise<CmsPageDto[]> {
  const path = CMS_BASE + "/sites/" + encodeURIComponent(siteId) + "/pages?limit=200";
  const response = await requestCmsJson(path, pageListSchema, { method: "GET" });
  return response.data.items;
}

const REDIRECT_LIST_LIMIT = 100;

export async function listSiteRedirects(siteId: string): Promise<{
  items: CmsRedirectDto[];
  nextCursor: string | null;
}> {
  const path =
    CMS_BASE +
    "/sites/" +
    encodeURIComponent(siteId) +
    "/redirects?limit=" +
    String(REDIRECT_LIST_LIMIT);
  const response = await requestCmsJson(path, redirectListSchema, { method: "GET" });
  return response.data;
}

export async function createSiteRequest(
  input: { title: string; slug: string; templateId: string | null },
  idempotencyKey: string
): Promise<CreateSiteResult> {
  const response = await requestCmsJson(CMS_BASE + "/sites", createSiteSchema, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function createPageRequest(
  siteId: string,
  input: { title: string; path: string; parentId: string | null }
): Promise<CmsPageDto> {
  const path = CMS_BASE + "/sites/" + encodeURIComponent(siteId) + "/pages";
  const response = await requestCmsJson(path, pageResultSchema, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data.page;
}

export async function renamePageRequest(
  pageId: string,
  input: { title: string; path: string; expectedRevision: number }
): Promise<CmsPageDto> {
  const response = await requestCmsJson(CMS_BASE + "/pages/" + encodeURIComponent(pageId), pageResultSchema, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return response.data.page;
}

export interface PageReorderInput {
  readonly direction: "up" | "down";
  readonly expectedRevision: number;
}

export async function reorderPageRequest(
  pageId: string,
  input: PageReorderInput
): Promise<CmsPageDto> {
  const response = await requestCmsJson(
    CMS_BASE + "/pages/" + encodeURIComponent(pageId) + "/order",
    pageResultSchema,
    { method: "PATCH", body: JSON.stringify(input) }
  );
  return response.data.page;
}

export async function duplicatePageRequest(pageId: string): Promise<CmsPageDto> {
  const response = await requestCmsJson(
    CMS_BASE + "/pages/" + encodeURIComponent(pageId) + "/duplicate",
    pageResultSchema,
    { method: "POST" }
  );
  return response.data.page;
}

export async function archivePageRequest(
  pageId: string,
  expectedRevision: number
): Promise<CmsPageDto> {
  const response = await requestCmsJson(
    CMS_BASE + "/pages/" + encodeURIComponent(pageId) + "/archive",
    pageResultSchema,
    { method: "POST", body: JSON.stringify({ expectedRevision }) }
  );
  return response.data.page;
}
function appearancePath(siteId: string, action?: string): string {
  const base = CMS_BASE + "/sites/" + encodeURIComponent(siteId) + "/appearance";
  return action === undefined ? base : base + "/" + action;
}

export async function getSiteAppearance(siteId: string): Promise<CmsAppearanceDto> {
  const response = await requestCmsJson(appearancePath(siteId), appearanceResultSchema, {
    method: "GET",
  });
  return response.data.appearance;
}

export async function listAppearanceThemes(): Promise<CmsAppearanceThemeDto[]> {
  const response = await requestCmsJson(CMS_BASE + "/themes", appearanceThemeListSchema, {
    method: "GET",
  });
  return response.data.items;
}

export async function updateSiteAppearance(
  siteId: string,
  input: AppearanceUpdateInput
): Promise<CmsAppearanceDto> {
  const response = await requestCmsJson(appearancePath(siteId), appearanceResultSchema, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return response.data.appearance;
}

export async function selectAppearanceTheme(
  siteId: string,
  input: AppearanceThemeInput
): Promise<CmsAppearanceDto> {
  const response = await requestCmsJson(appearancePath(siteId, "theme"), appearanceResultSchema, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data.appearance;
}

export async function resetSiteAppearance(
  siteId: string,
  expectedVersion: number
): Promise<CmsAppearanceDto> {
  const response = await requestCmsJson(appearancePath(siteId, "reset"), appearanceResultSchema, {
    method: "POST",
    body: JSON.stringify({ expectedVersion }),
  });
  return response.data.appearance;
}

export async function publishSiteAppearance(
  siteId: string,
  expectedVersion: number
): Promise<CmsAppearanceDto> {
  const response = await requestCmsJson(appearancePath(siteId, "publish"), appearanceResultSchema, {
    method: "POST",
    body: JSON.stringify({ expectedVersion }),
  });
  return response.data.appearance;
}


/** Issues a signed, expiring storefront link for this site's drafts (FR-037). */
export async function createSitePreviewLink(
  siteId: string,
  path: string
): Promise<{ url: string; expiresAt: string }> {
  const query = new URLSearchParams({ path });
  const requestPath =
    CMS_BASE + "/sites/" + encodeURIComponent(siteId) + "/preview-link?" + query.toString();
  const response = await requestCmsJson(requestPath, previewLinkSchema, { method: "GET" });
  return response.data.preview;
}

/** Downloads the workspace's own site as the portable export document (SC-012). */
export async function exportSiteRequest(siteId: string): Promise<SiteExportDocument> {
  const path = CMS_BASE + "/sites/" + encodeURIComponent(siteId) + "/export";
  const response = await requestCmsJson(path, siteExportEnvelopeSchema, { method: "GET" });
  return response.data.export;
}
