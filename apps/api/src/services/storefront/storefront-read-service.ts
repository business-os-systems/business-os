import { Prisma, prisma, withTenantContext } from "@suite/db";
import {
  isReservedPath,
  normalizeHostname,
  normalizePathname,
} from "@suite/core";
import { z } from "zod";
import {
  STOREFRONT_PATH_MAX_LENGTH,
  STOREFRONT_REDIRECT_MAX_DEPTH,
  type StorefrontPageOutcome,
  type StorefrontPageSeo,
  type StorefrontRedirectEntry,
  type StorefrontResolveOutcome,
  type StorefrontResolvePayload,
  type StorefrontSiteOutcome,
  type StorefrontSiteSummary,
  type StorefrontSitemapOutcome,
} from "./contract.seo.js";

const SITEMAP_ROW_LIMIT = 50_000;
const REDIRECT_ROW_LIMIT = 10_000;
const SEO_TITLE_MAX_LENGTH = 200;
const SEO_DESCRIPTION_MAX_LENGTH = 500;
const SEO_KEYWORD_MAX_LENGTH = 50;
const SEO_KEYWORDS_MAX = 30;
const OG_IMAGE_MAX_LENGTH = 2048;
const GONE_SITE_STATUSES: readonly string[] = ["SUSPENDED", "ARCHIVED"];

const pageSeoSchema = z
  .object({
    title: z.string().trim().min(1).max(SEO_TITLE_MAX_LENGTH).optional(),
    description: z.string().trim().min(1).max(SEO_DESCRIPTION_MAX_LENGTH).optional(),
    keywords: z
      .array(z.string().trim().min(1).max(SEO_KEYWORD_MAX_LENGTH))
      .max(SEO_KEYWORDS_MAX)
      .optional(),
    ogImageUrl: z.string().trim().min(1).max(OG_IMAGE_MAX_LENGTH).optional(),
  })
  .strict();

interface SiteRow {
  readonly id: string;
  readonly organizationId: string;
  readonly status: string;
  readonly title: string;
  readonly primaryLocale: string;
}

interface PageRow {
  readonly slug: string;
  readonly title: string;
  readonly updatedAt: Date;
  readonly content: { readonly publishedAst: Prisma.JsonValue | null } | null;
}

interface PublishedMeta {
  readonly seoTitle: string | null;
  readonly description: string | null;
  readonly keywords: string[];
  readonly ogImageUrl: string | null;
}

function emptyMeta(): PublishedMeta {
  return { seoTitle: null, description: null, keywords: [], ogImageUrl: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeImageUrl(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.toString();
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      return null;
    }
    throw error;
  }
}

function readPublishedMeta(publishedAst: Prisma.JsonValue | null): PublishedMeta {
  if (!isRecord(publishedAst) || !isRecord(publishedAst.meta)) {
    return emptyMeta();
  }
  const parsed = pageSeoSchema.safeParse(publishedAst.meta);
  if (!parsed.success) {
    return emptyMeta();
  }
  return {
    seoTitle: parsed.data.title ?? null,
    description: parsed.data.description ?? null,
    keywords: parsed.data.keywords ?? [],
    ogImageUrl: safeImageUrl(parsed.data.ogImageUrl),
  };
}

function hasPublishedContent(row: PageRow): boolean {
  return row.content !== null && row.content.publishedAst !== null;
}

function toPageSeo(row: PageRow): StorefrontPageSeo {
  const meta = readPublishedMeta(row.content?.publishedAst ?? null);
  return {
    path: row.slug,
    title: row.title,
    seoTitle: meta.seoTitle,
    description: meta.description,
    keywords: meta.keywords,
    ogImageUrl: meta.ogImageUrl,
    lastModified: row.updatedAt.toISOString(),
  };
}

function toSiteSummary(site: SiteRow): StorefrontSiteSummary {
  return {
    siteId: site.id,
    status: "PUBLISHED",
    title: site.title,
    homePath: "/",
    defaultLocale: site.primaryLocale,
  };
}

function normalizeStorefrontPath(rawPath: string): string | null {
  const trimmed = rawPath.trim();
  if (trimmed.length === 0 || trimmed.length > STOREFRONT_PATH_MAX_LENGTH) {
    return null;
  }
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return null;
  }
  if (trimmed.includes("..") || trimmed.includes("%")) {
    return null;
  }
  const normalized = normalizePathname(trimmed);
  if (isReservedPath(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeRedirectPath(rawPath: string): string | null {
  const trimmed = rawPath.trim();
  if (trimmed.length === 0 || trimmed.length > STOREFRONT_PATH_MAX_LENGTH) {
    return null;
  }
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    trimmed.includes("%")
  ) {
    return null;
  }
  const normalized = normalizePathname(trimmed);
  if (isReservedPath(normalized)) {
    return null;
  }
  return normalized;
}

/**
 * The host-to-tenant lookup is the only owner-identity read on this surface:
 * the caller supplies a hostname, never a tenant id, and every subsequent page
 * query runs through the tenant RLS context derived from this row.
 */
async function findSiteByHostname(hostname: string): Promise<SiteRow | null> {
  const normalized = normalizeHostname(hostname);
  if (normalized === null) {
    return null;
  }
  const domain = await prisma.cmsDomain.findFirst({
    where: { hostname: normalized, status: "ACTIVE" },
    select: { siteId: true },
  });
  if (domain === null) {
    return null;
  }
  return prisma.cmsSite.findFirst({
    where: { id: domain.siteId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      title: true,
      primaryLocale: true,
    },
  });
}

function toSiteOutcome(site: SiteRow): StorefrontSiteOutcome {
  if (site.status === "PUBLISHED") {
    return {
      kind: "published",
      organizationId: site.organizationId,
      site: toSiteSummary(site),
    };
  }
  if (GONE_SITE_STATUSES.includes(site.status)) {
    return { kind: "gone" };
  }
  return { kind: "not_found" };
}

/** Resolves a host to its published site without exposing tenant identifiers. */
export async function resolvePublishedSite(hostname: string): Promise<StorefrontSiteOutcome> {
  const site = await findSiteByHostname(hostname);
  return site === null ? { kind: "not_found" } : toSiteOutcome(site);
}

async function readHomePageRow(
  organizationId: string,
  siteId: string
): Promise<PageRow | null> {
  return withTenantContext(organizationId, (tx) =>
    tx.cmsPage.findFirst({
      where: { siteId, isHomePage: true, status: "PUBLISHED" },
      select: {
        slug: true,
        title: true,
        updatedAt: true,
        content: { select: { publishedAst: true } },
      },
    })
  );
}

/** The published home page's SEO fields, or null when nothing is published. */
export async function readPublishedHomeSeo(
  organizationId: string,
  siteId: string
): Promise<Omit<StorefrontPageSeo, "lastModified"> | null> {
  const row = await readHomePageRow(organizationId, siteId);
  if (row === null || !hasPublishedContent(row)) {
    return null;
  }
  const page = toPageSeo(row);
  return {
    path: page.path,
    title: page.title,
    seoTitle: page.seoTitle,
    description: page.description,
    keywords: page.keywords,
    ogImageUrl: page.ogImageUrl,
  };
}

function toResolvePayload(
  site: Extract<StorefrontSiteOutcome, { readonly kind: "published" }>,
  homePage: Omit<StorefrontPageSeo, "lastModified"> | null
): StorefrontResolvePayload {
  return {
    siteId: site.site.siteId,
    status: "PUBLISHED",
    title: site.site.title,
    homePath: homePage?.path ?? site.site.homePath,
    defaultLocale: site.site.defaultLocale,
    homePage,
  };
}

/** Resolve contract: host in, public site metadata and home-page SEO out. */
export async function resolveStorefrontPayload(
  hostname: string
): Promise<StorefrontResolveOutcome> {
  const site = await resolvePublishedSite(hostname);
  if (site.kind !== "published") {
    return { kind: site.kind };
  }
  const homePage = await readPublishedHomeSeo(site.organizationId, site.site.siteId);
  return { kind: "ok", payload: toResolvePayload(site, homePage) };
}

interface RedirectHop {
  readonly sourcePath: string;
  readonly visited: ReadonlySet<string>;
  readonly depth: number;
  readonly redirectType: "PERMANENT" | "TEMPORARY";
}

interface RedirectResolution {
  readonly targetPath: string;
  readonly redirectType: "PERMANENT" | "TEMPORARY";
}

async function followRedirect(
  tx: Prisma.TransactionClient,
  siteId: string,
  hop: RedirectHop
): Promise<RedirectResolution | null> {
  if (hop.depth >= STOREFRONT_REDIRECT_MAX_DEPTH || hop.visited.has(hop.sourcePath)) {
    return null;
  }
  const row = await tx.cmsUrlRedirect.findFirst({
    where: { siteId, sourcePath: hop.sourcePath },
    select: { targetUrl: true, type: true },
  });
  if (row === null) {
    return hop.depth === 0 ? null : { targetPath: hop.sourcePath, redirectType: hop.redirectType };
  }
  const next = normalizeRedirectPath(row.targetUrl);
  if (next === null) {
    return null;
  }
  const redirectType =
    hop.depth === 0 && row.type === "TEMPORARY" ? "TEMPORARY" : hop.redirectType;
  const visited = new Set(hop.visited);
  visited.add(hop.sourcePath);
  return followRedirect(tx, siteId, {
    sourcePath: next,
    visited,
    depth: hop.depth + 1,
    redirectType,
  });
}

async function readRedirectTarget(
  organizationId: string,
  siteId: string,
  sourcePath: string
): Promise<RedirectResolution | null> {
  return withTenantContext(organizationId, (tx) =>
    followRedirect(tx, siteId, {
      sourcePath,
      visited: new Set<string>(),
      depth: 0,
      redirectType: "PERMANENT",
    })
  );
}

async function findPublishedPageRow(
  organizationId: string,
  siteId: string,
  path: string
): Promise<PageRow | null> {
  return withTenantContext(organizationId, (tx) =>
    tx.cmsPage.findFirst({
      where: { siteId, slug: path, status: "PUBLISHED" },
      select: {
        slug: true,
        title: true,
        updatedAt: true,
        content: { select: { publishedAst: true } },
      },
    })
  );
}

/**
 * Published page contract: the page's published SEO fields, a permanent
 * redirect resolved through its chain, or a neutral not-found (FR-038).
 */
export async function readPublishedPage(
  hostname: string,
  rawPath: string
): Promise<StorefrontPageOutcome> {
  const site = await resolvePublishedSite(hostname);
  if (site.kind !== "published") {
    return { kind: site.kind };
  }
  const path = normalizeStorefrontPath(rawPath);
  if (path === null) {
    return { kind: "not_found" };
  }
  const row = await findPublishedPageRow(site.organizationId, site.site.siteId, path);
  if (row !== null && hasPublishedContent(row)) {
    return { kind: "page", site: site.site, page: toPageSeo(row) };
  }
  const redirect = await readRedirectTarget(site.organizationId, site.site.siteId, path);
  if (redirect !== null && redirect.targetPath !== path) {
    return {
      kind: "redirect",
      site: site.site,
      sourcePath: path,
      targetPath: redirect.targetPath,
      redirectType: redirect.redirectType,
    };
  }
  return { kind: "not_found" };
}

function toRedirectEntries(
  rows: readonly { readonly sourcePath: string; readonly targetUrl: string }[]
): StorefrontRedirectEntry[] {
  return rows.flatMap((row) => {
    const sourcePath = normalizeRedirectPath(row.sourcePath);
    const targetPath = normalizeRedirectPath(row.targetUrl);
    if (sourcePath === null || targetPath === null || targetPath === sourcePath) {
      return [];
    }
    return [{ sourcePath, targetPath }];
  });
}

/**
 * Sitemap contract: published pages only, with redirected and archived
 * addresses removed before the response leaves the API (FR-038, FR-040).
 */
export async function readPublishedSitemap(
  hostname: string
): Promise<StorefrontSitemapOutcome> {
  const site = await resolvePublishedSite(hostname);
  if (site.kind !== "published") {
    return { kind: site.kind };
  }
  const result = await withTenantContext(site.organizationId, async (tx) => {
    const rows = await tx.cmsPage.findMany({
      where: { siteId: site.site.siteId, status: "PUBLISHED" },
      orderBy: [{ slug: "asc" }],
      take: SITEMAP_ROW_LIMIT,
      select: {
        slug: true,
        title: true,
        updatedAt: true,
        content: { select: { publishedAst: true } },
      },
    });
    const redirects = await tx.cmsUrlRedirect.findMany({
      where: { siteId: site.site.siteId },
      orderBy: [{ sourcePath: "asc" }],
      take: REDIRECT_ROW_LIMIT,
      select: { sourcePath: true, targetUrl: true },
    });
    return { rows, redirects };
  });
  const redirectEntries = toRedirectEntries(result.redirects);
  const redirected = new Set(redirectEntries.map((entry) => entry.sourcePath));
  const pages = result.rows
    .filter((row) => hasPublishedContent(row) && !redirected.has(row.slug))
    .map((row) => ({ path: row.slug, lastModified: row.updatedAt.toISOString() }));
  return {
    kind: "ok",
    sitemap: {
      site: {
        title: site.site.title,
        homePath: site.site.homePath,
        defaultLocale: site.site.defaultLocale,
      },
      pages,
      redirects: redirectEntries,
    },
  };
}
