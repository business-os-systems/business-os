import type { StorefrontPageResult } from "@/lib/storefront/page-client";

/**
 * Storefront cache policy (T075, FR-042).
 *
 * A shared cache key is host + path, never path alone. Every published response
 * declares Vary: Host so a CDN cannot answer one tenant's address with another
 * tenant's page. Holding and error responses are short-lived and never share a
 * cache entry with published content. A preview response is never stored.
 */

export const PREVIEW_TOKEN_HEADER = "x-preview-token";
const NON_INDEXED = "noindex, nofollow";

export type StorefrontCacheState = "published" | "holding" | "gone" | "error" | "preview";

const CACHE_CONTROL_BY_STATE: Record<StorefrontCacheState, string> = {
  published: "public, s-maxage=3600, stale-while-revalidate=86400",
  holding: "public, s-maxage=60, stale-while-revalidate=300",
  gone: "public, s-maxage=60, stale-while-revalidate=300",
  error: "no-store",
  preview: "private, no-store",
};

const ROBOTS_BY_STATE: Record<StorefrontCacheState, string> = {
  published: "index, follow",
  holding: NON_INDEXED,
  gone: NON_INDEXED,
  error: NON_INDEXED,
  preview: NON_INDEXED,
};

const CACHE_STATE_BY_PAGE_RESULT: Record<StorefrontPageResult["kind"], StorefrontCacheState> = {
  published: "published",
  not_found: "holding",
  gone: "gone",
  upstream_error: "error",
};

export function cacheStateForPageResult(result: {
  readonly kind: StorefrontPageResult["kind"];
}): StorefrontCacheState {
  return CACHE_STATE_BY_PAGE_RESULT[result.kind];
}

export interface StorefrontCacheKeyInput {
  readonly host: string;
  readonly path: string;
}

/** The shared-cache identity; a path alone must never be used as a key. */
export function storefrontCacheKey(input: StorefrontCacheKeyInput): string {
  return "host=" + input.host + ";path=" + input.path;
}

function varyHeader(previewToken: string | null): string {
  if (previewToken === null) {
    return "Host";
  }
  return "Host, " + PREVIEW_TOKEN_HEADER;
}

export interface StorefrontCacheHeaderInput extends StorefrontCacheKeyInput {
  readonly state: StorefrontCacheState;
  readonly previewToken: string | null;
}

export function storefrontCacheHeaders(input: StorefrontCacheHeaderInput): Record<string, string> {
  const state = input.previewToken === null ? input.state : "preview";
  return {
    "Cache-Control": CACHE_CONTROL_BY_STATE[state],
    Vary: varyHeader(input.previewToken),
    "X-Robots-Tag": ROBOTS_BY_STATE[state],
    "X-Storefront-Cache-Key": storefrontCacheKey({ host: input.host, path: input.path }),
  };
}
