import { z } from "zod";
import { MediaAssetMapSchema, PageAstSchema } from "@suite/website-builder/ast";
import { AppearanceTokensSchema } from "@suite/website-builder/appearance";

/**
 * Public storefront read contract (T054, FR-035..FR-043).
 *
 * The contract is deliberately anonymous: no session, no cookies and no tenant
 * identifier in a response. Internal ids are resolved server-side and never
 * serialised, so a visitor cannot learn which workspace owns a host.
 */

export const STOREFRONT_ERROR_CODE = {
  NOT_FOUND: "STOREFRONT_NOT_FOUND",
  GONE: "STOREFRONT_GONE",
} as const;

export const STOREFRONT_ERROR_TITLE = {
  NOT_FOUND: "Not Found",
  GONE: "Gone",
} as const;

export const STOREFRONT_ERROR_DETAIL = {
  NOT_FOUND: "The requested website was not found.",
  GONE: "This website is no longer available.",
} as const;

/** Status discriminators shared by the service and its database reads. */
export const STOREFRONT_SITE_STATUS = {
  PUBLISHED: "PUBLISHED",
  DRAFT: "DRAFT",
  MAINTENANCE: "MAINTENANCE",
  SUSPENDED: "SUSPENDED",
  ARCHIVED: "ARCHIVED",
} as const;

export const STOREFRONT_PAGE_STATUS = {
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const;

export const STOREFRONT_DOMAIN_STATUS = {
  ACTIVE: "ACTIVE",
} as const;

/** The only public page address states a host can be in. */
export type StorefrontDeliveryState = "published" | "not_published" | "gone";

export interface StorefrontSiteMetadata {
  readonly title: string;
  readonly homePath: string;
  readonly defaultLocale: string;
  readonly tokens: z.infer<typeof AppearanceTokensSchema>;
}

export interface StorefrontPageMetadata {
  readonly title: string;
  readonly path: string;
  readonly ast: z.infer<typeof PageAstSchema>;
  /** Public asset URLs resolved for the published AST at read time. */
  readonly media: z.infer<typeof MediaAssetMapSchema>;
  readonly tokens: z.infer<typeof AppearanceTokensSchema>;
}

export type StorefrontResolveOutcome =
  | { readonly kind: "published"; readonly site: StorefrontSiteMetadata }
  | { readonly kind: "not_found" }
  | { readonly kind: "gone" };

export type StorefrontPageOutcome =
  | { readonly kind: "published"; readonly page: StorefrontPageMetadata }
  | { readonly kind: "not_found" }
  | { readonly kind: "gone" };

export interface StorefrontReadService {
  resolveHost(host: string): Promise<StorefrontResolveOutcome>;
  readPage(input: {
    readonly host: string;
    readonly path: string;
  }): Promise<StorefrontPageOutcome>;
}

/**
 * A signed, expiring preview link for unpublished content (FR-037). The token
 * names the host and an expiry time only; no tenant or site id travels in a
 * visitor-visible URL, and the API re-resolves the host to the site on every
 * read. A tampered or expired token is indistinguishable from an unknown host.
 */
export interface StorefrontPreviewLink {
  readonly url: string;
  readonly expiresAt: string;
}

export interface StorefrontPreviewService {
  createLink(input: {
    readonly organizationId: string;
    readonly siteId: string;
    readonly path: string;
  }): Promise<StorefrontPreviewLink>;
  readPage(input: {
    readonly token: string;
    readonly path: string;
  }): Promise<StorefrontPageOutcome>;
}

export const storefrontHostQuerySchema = z
  .object({
    host: z.string().trim().min(1).max(253),
  })
  .strict();

export const storefrontPageQuerySchema = z
  .object({
    host: z.string().trim().min(1).max(253),
    path: z.string().trim().min(1).max(2048).optional(),
  })
  .strict();

export const storefrontPreviewQuerySchema = z
  .object({
    token: z.string().trim().min(1).max(4096),
    path: z.string().trim().min(1).max(2048).optional(),
  })
  .strict();

export const previewLinkQuerySchema = z
  .object({ path: z.string().trim().min(1).max(2048).optional() })
  .strict();

export const previewLinkResultSchema = z
  .object({
    url: z.string().url().max(4096),
    expiresAt: z.string().datetime(),
  })
  .strict();

export const storefrontResolveResponseSchema = z
  .object({
    title: z.string(),
    status: z.literal(STOREFRONT_SITE_STATUS.PUBLISHED),
    homePath: z.string(),
    defaultLocale: z.string(),
    theme: z.object({ tokens: AppearanceTokensSchema }).strict(),
  })
  .strict();

/**
 * OpenAPI cannot render the recursive NavItem ZodLazy. The wire contract
 * documents the AST as a JSON object; the service still validates it with
 * PageAstSchema before responding.
 */
const pageAstJsonSchema = z.record(z.string(), z.unknown()) as unknown as typeof PageAstSchema;

export const storefrontPageResponseSchema = z
  .object({
    title: z.string(),
    path: z.string(),
    ast: pageAstJsonSchema,
    media: MediaAssetMapSchema,
    tokens: AppearanceTokensSchema,
  })
  .strict();
