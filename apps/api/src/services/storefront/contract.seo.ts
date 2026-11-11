import { z } from "zod";

/**
 * Public storefront read contract (contracts/storefront.md, FR-035..FR-043).
 *
 * The host is the only tenant authority on this surface; no request body or
 * query parameter may name an organization, site or page id. Every response
 * carries public copy and the page's published SEO metadata only.
 */

export const STOREFRONT_HOST_MAX_LENGTH = 253;
export const STOREFRONT_PATH_MAX_LENGTH = 191;
export const STOREFRONT_REDIRECT_MAX_DEPTH = 5;

export const storefrontResolveQuerySchema = z
  .object({
    host: z.string().trim().min(1).max(STOREFRONT_HOST_MAX_LENGTH),
  })
  .strict();

export const storefrontPageQuerySchema = z
  .object({
    host: z.string().trim().min(1).max(STOREFRONT_HOST_MAX_LENGTH),
    path: z.string().trim().min(1).max(STOREFRONT_PATH_MAX_LENGTH),
  })
  .strict();

export interface StorefrontSiteSummary {
  readonly siteId: string;
  readonly status: "PUBLISHED";
  readonly title: string;
  readonly homePath: string;
  readonly defaultLocale: string;
}

export interface StorefrontPageSeo {
  readonly path: string;
  readonly title: string;
  readonly seoTitle: string | null;
  readonly description: string | null;
  readonly keywords: string[];
  readonly ogImageUrl: string | null;
  readonly lastModified: string;
}

export type StorefrontSiteOutcome =
  | {
      readonly kind: "published";
      readonly organizationId: string;
      readonly site: StorefrontSiteSummary;
    }
  | { readonly kind: "gone" }
  | { readonly kind: "not_found" };

export interface StorefrontResolvePayload {
  readonly siteId: string;
  readonly status: "PUBLISHED";
  readonly title: string;
  readonly homePath: string;
  readonly defaultLocale: string;
  readonly homePage: Omit<StorefrontPageSeo, "lastModified"> | null;
}

export type StorefrontResolveOutcome =
  | { readonly kind: "ok"; readonly payload: StorefrontResolvePayload }
  | { readonly kind: "gone" }
  | { readonly kind: "not_found" };

export type StorefrontPageOutcome =
  | {
      readonly kind: "page";
      readonly site: StorefrontSiteSummary;
      readonly page: StorefrontPageSeo;
    }
  | {
      readonly kind: "redirect";
      readonly site: StorefrontSiteSummary;
      readonly sourcePath: string;
      readonly targetPath: string;
      readonly redirectType: "PERMANENT" | "TEMPORARY";
    }
  | { readonly kind: "gone" }
  | { readonly kind: "not_found" };

export interface StorefrontSitemapEntry {
  readonly path: string;
  readonly lastModified: string;
}

export interface StorefrontRedirectEntry {
  readonly sourcePath: string;
  readonly targetPath: string;
}

export interface StorefrontSitemapPayload {
  readonly site: {
    readonly title: string;
    readonly homePath: string;
    readonly defaultLocale: string;
  };
  readonly pages: StorefrontSitemapEntry[];
  readonly redirects: StorefrontRedirectEntry[];
}

export type StorefrontSitemapOutcome =
  | { readonly kind: "ok"; readonly sitemap: StorefrontSitemapPayload }
  | { readonly kind: "gone" }
  | { readonly kind: "not_found" };
