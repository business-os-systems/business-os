/**
 * Per-host sitemap assembly (FR-040, FR-042, FR-115).
 *
 * The storefront never reads the database; it consumes the published-only
 * sitemap contract, drops every redirected, archived or reserved address and
 * builds absolute URLs from the verified tenant origin. Values are XML-escaped
 * and the document is cached per host.
 */

import { isNonStorefrontPath } from "@suite/core";
import { z } from "zod";
import { buildCanonicalUrl } from "@/lib/storefront/pages";
import { getStorefrontApiUrl } from "@/lib/env";

const SITEMAP_API_PATH = "/api/v1/storefront/sitemap";
const SITEMAP_TIMEOUT_MS = 3000;
const SITEMAP_MAX_URLS = 50_000;
const SITEMAP_MAX_REDIRECTS = 10_000;
const PATH_MAX_LENGTH = 255;

const pageEntrySchema = z
  .object({
    path: z.string().startsWith("/").max(PATH_MAX_LENGTH),
    lastModified: z.string().datetime(),
  })
  .strict();

const redirectEntrySchema = z
  .object({
    sourcePath: z.string().startsWith("/").max(PATH_MAX_LENGTH),
    targetPath: z.string().startsWith("/").max(PATH_MAX_LENGTH),
  })
  .strict();

const sitemapResponseSchema = z
  .object({
    site: z
      .object({
        title: z.string().min(1),
        homePath: z.string().startsWith("/"),
        defaultLocale: z.string().min(1),
      })
      .strict(),
    pages: z.array(pageEntrySchema).max(SITEMAP_MAX_URLS),
    redirects: z.array(redirectEntrySchema).max(SITEMAP_MAX_REDIRECTS),
  })
  .strict();

export type SitemapData = z.infer<typeof sitemapResponseSchema>;

export type SitemapFetchResult =
  | { readonly kind: "ok"; readonly data: SitemapData }
  | { readonly kind: "unavailable" }
  | { readonly kind: "upstream_error" };

const XML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => XML_ESCAPES[character] ?? "");
}

const INDEXABLE_PATH_PATTERN = /^\/[a-z0-9/-]*$/;

function isIndexablePath(path: string): boolean {
  if (!INDEXABLE_PATH_PATTERN.test(path) || path.includes("//")) {
    return false;
  }
  return !isNonStorefrontPath(path);
}

function redirectedPaths(data: SitemapData): ReadonlySet<string> {
  return new Set(data.redirects.map((entry) => entry.sourcePath));
}

/** Published, non-redirected, non-reserved addresses in stable order. */
export function selectSitemapPaths(data: SitemapData): readonly string[] {
  const excluded = redirectedPaths(data);
  const seen = new Set<string>();
  const selected: string[] = [];
  for (const entry of data.pages) {
    if (excluded.has(entry.path) || !isIndexablePath(entry.path) || seen.has(entry.path)) {
      continue;
    }
    seen.add(entry.path);
    selected.push(entry.path);
    if (selected.length >= SITEMAP_MAX_URLS) {
      break;
    }
  }
  return selected.sort();
}

export function renderSitemapXml(origin: string, data: SitemapData): string {
  const lastModifiedByPath = new Map<string, string>();
  for (const entry of data.pages) {
    lastModifiedByPath.set(entry.path, entry.lastModified);
  }
  const urls = selectSitemapPaths(data).flatMap((path) => {
    const loc = buildCanonicalUrl(origin, path);
    if (loc === null) {
      return [];
    }
    const lastModified = lastModifiedByPath.get(path);
    const lastmod = lastModified === undefined ? "" : "<lastmod>" + escapeXml(lastModified) + "</lastmod>";
    return ["<url><loc>" + escapeXml(loc) + "</loc>" + lastmod + "</url>"];
  });
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls.join("") +
    "</urlset>"
  );
}

export async function fetchSitemap(hostname: string): Promise<SitemapFetchResult> {
  try {
    const url = new URL(SITEMAP_API_PATH, getStorefrontApiUrl());
    url.searchParams.set("host", hostname);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(SITEMAP_TIMEOUT_MS),
    });
    if (response.status === 404 || response.status === 410) {
      return { kind: "unavailable" };
    }
    if (!response.ok) {
      return { kind: "upstream_error" };
    }
    const parsed = sitemapResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { kind: "upstream_error" };
    }
    return { kind: "ok", data: parsed.data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Storefront sitemap fetch failed:", message);
    return { kind: "upstream_error" };
  }
}
