/**
 * Storefront document rendering (FR-035, FR-039, FR-041, FR-110, FR-143).
 *
 * Pure string rendering keeps the delivery response testable and guarantees the
 * root can never render workspace, session or tenant-identifier content. Every
 * dynamic value is escaped; published output exposes only public site copy and
 * the page's published SEO metadata.
 */

import { toSafeHttpUrl } from "@/lib/storefront/url";

export interface PublicPageSeo {
  readonly path: string;
  readonly title: string;
  readonly description: string | null;
  readonly keywords: readonly string[];
  readonly ogImageUrl: string | null;
}

export interface PublicSite {
  readonly title: string;
  readonly homePath: string;
  readonly defaultLocale: string;
  readonly homePage: PublicPageSeo | null;
}

export interface StorefrontHttpResponse {
  readonly body: string;
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const BASE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy":
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  Vary: "Host",
};

const PUBLISHED_CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";
const PRIVATE_CACHE = "private, no-store";
const NON_INDEXED = "noindex, nofollow";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? "");
}

/** Serialises JSON-LD so a value can never close the script element. */
function serializeStructuredData(value: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/**
 * Resolves a canonical URL only when the path stays on the declared tenant
 * origin. A protocol-relative or absolute path can never change the host.
 */
export function buildCanonicalUrl(origin: string | null, path: string): string | null {
  if (origin === null || !path.startsWith("/") || path.startsWith("//")) {
    return null;
  }
  try {
    const base = new URL(origin);
    const resolved = new URL(path, base);
    if (resolved.origin !== base.origin) {
      return null;
    }
    return resolved.toString();
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      return null;
    }
    throw error;
  }
}

interface SeoHeadInput {
  readonly site: PublicSite;
  readonly page: PublicPageSeo | null;
  readonly origin: string | null;
}

function renderSocialImage(imageUrl: string | null): string[] {
  if (imageUrl === null) {
    return [];
  }
  return ['<meta property="og:image" content="' + escapeHtml(imageUrl) + '">'];
}

function renderDescription(description: string | null): string[] {
  if (description === null) {
    return [];
  }
  return ['<meta name="description" content="' + escapeHtml(description) + '">'];
}

function renderCanonical(canonicalUrl: string | null): string[] {
  if (canonicalUrl === null) {
    return [];
  }
  return [
    '<link rel="canonical" href="' + escapeHtml(canonicalUrl) + '">',
    '<meta property="og:url" content="' + escapeHtml(canonicalUrl) + '">',
  ];
}

interface SocialTagsInput {
  readonly siteTitle: string;
  readonly pageTitle: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
}

function renderSocialTags(input: SocialTagsInput): string[] {
  const tags = [
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="' + escapeHtml(input.siteTitle) + '">',
    '<meta property="og:title" content="' + escapeHtml(input.pageTitle) + '">',
  ];
  if (input.description !== null) {
    tags.push('<meta property="og:description" content="' + escapeHtml(input.description) + '">');
  }
  tags.push(...renderSocialImage(input.imageUrl));
  const card = input.imageUrl === null ? "summary" : "summary_large_image";
  tags.push('<meta name="twitter:card" content="' + card + '">');
  return tags;
}

function renderSeoHead(input: SeoHeadInput): string[] {
  const description = input.page?.description ?? null;
  const canonicalPath = input.page?.path ?? input.site.homePath;
  const canonicalUrl = buildCanonicalUrl(input.origin, canonicalPath);
  const imageUrl = toSafeHttpUrl(input.page?.ogImageUrl ?? null);
  return [
    '<meta name="robots" content="index, follow">',
    ...renderDescription(description),
    ...renderCanonical(canonicalUrl),
    ...renderSocialTags({
      siteTitle: input.site.title,
      pageTitle: input.page?.title ?? input.site.title,
      description,
      imageUrl,
    }),
    ...renderStructuredData(input.site, input.page, canonicalUrl, description),
  ];
}

function renderStructuredData(
  site: PublicSite,
  page: PublicPageSeo | null,
  canonicalUrl: string | null,
  description: string | null
): string[] {
  if (canonicalUrl === null) {
    return [];
  }
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page?.title ?? site.title,
    url: canonicalUrl,
  };
  if (description !== null) {
    data.description = description;
  }
  return [
    '<script type="application/ld+json">' + serializeStructuredData(data) + "</script>",
  ];
}

function renderDocument(input: {
  readonly title: string;
  readonly head: readonly string[];
  readonly body: string;
}): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    ...input.head,
    "<title>" + escapeHtml(input.title) + "</title>",
    "</head>",
    "<body>",
    input.body,
    "</body>",
    "</html>",
  ].join("");
}

function renderPublishedDocument(
  site: PublicSite,
  page: PublicPageSeo | null,
  origin: string | null
): string {
  const title = page?.title ?? site.title;
  const content = [
    "<main>",
    "<h1>" + escapeHtml(title) + "</h1>",
    '<p data-locale="' + escapeHtml(site.defaultLocale) + '">Welcome.</p>',
    "</main>",
  ].join("");
  return renderDocument({
    title,
    head: renderSeoHead({ site, page, origin }),
    body: content,
  });
}

function renderNeutral(title: string, message: string): string {
  return renderDocument({
    title,
    head: ['<meta name="robots" content="' + escapeHtml(NON_INDEXED) + '">'],
    body: "<main><h1>" + escapeHtml(title) + "</h1><p>" + escapeHtml(message) + "</p></main>",
  });
}

/** A known tenant with nothing published: neutral, never a sign-in prompt. */
export function holdingResponse(): StorefrontHttpResponse {
  return {
    body: renderNeutral("Website unavailable", "This website is not available right now."),
    status: 404,
    headers: { ...BASE_HEADERS, "Cache-Control": PRIVATE_CACHE, "X-Robots-Tag": NON_INDEXED },
  };
}

/** Suspended or archived sites return GONE and never another tenant's content. */
export function goneResponse(): StorefrontHttpResponse {
  return {
    body: renderNeutral("Website unavailable", "This website is no longer available."),
    status: 410,
    headers: { ...BASE_HEADERS, "Cache-Control": PRIVATE_CACHE, "X-Robots-Tag": NON_INDEXED },
  };
}

/** An unresolved, malformed or non-tenant host is answered neutrally. */
export function notFoundResponse(): StorefrontHttpResponse {
  return {
    body: renderNeutral("Not found", "The requested website was not found."),
    status: 404,
    headers: { ...BASE_HEADERS, "Cache-Control": PRIVATE_CACHE, "X-Robots-Tag": NON_INDEXED },
  };
}

/** An upstream failure degrades to a neutral error, never to cached content. */
export function deliveryErrorResponse(): StorefrontHttpResponse {
  return {
    body: renderNeutral("Website unavailable", "This website cannot be served right now."),
    status: 503,
    headers: {
      ...BASE_HEADERS,
      "Cache-Control": PRIVATE_CACHE,
      "X-Robots-Tag": NON_INDEXED,
      "Retry-After": "30",
    },
  };
}

export function publishedPageResponse(
  site: PublicSite,
  page: PublicPageSeo | null,
  origin: string | null
): StorefrontHttpResponse {
  return {
    body: renderPublishedDocument(site, page, origin),
    status: 200,
    headers: {
      ...BASE_HEADERS,
      "Cache-Control": PUBLISHED_CACHE,
      "X-Robots-Tag": "index, follow",
    },
  };
}

export function publishedSiteResponse(
  site: PublicSite,
  origin: string | null
): StorefrontHttpResponse {
  return publishedPageResponse(site, site.homePage, origin);
}

export function toHttpResponse(response: StorefrontHttpResponse): Response {
  return new Response(response.body, { status: response.status, headers: response.headers });
}
