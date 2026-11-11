import { getStorefrontApiUrl } from "@/lib/env";
import { storefrontPageSchema, type StorefrontPage } from "@/lib/storefront/contract";

/**
 * Published-only page read for the storefront (T074).
 *
 * The request is anonymous: it carries no Cookie and no Authorization header,
 * reads only the published page endpoint and uses no-store so Next's data
 * cache can never answer a second host from the first host's entry.
 */

const STOREFRONT_PAGE_PATH = "/api/v1/storefront/page";
const PAGE_TIMEOUT_MS = 3000;

export type StorefrontPageResult =
  | { readonly kind: "published"; readonly page: StorefrontPage }
  | { readonly kind: "not_found" }
  | { readonly kind: "gone" }
  | { readonly kind: "upstream_error" };

export interface LoadStorefrontPageInput {
  readonly host: string;
  readonly path: string;
}

function statusToResult(status: number): StorefrontPageResult | null {
  if (status === 404) {
    return { kind: "not_found" };
  }
  if (status === 410) {
    return { kind: "gone" };
  }
  return null;
}

function buildPageUrl(input: LoadStorefrontPageInput): URL {
  const url = new URL(STOREFRONT_PAGE_PATH, getStorefrontApiUrl());
  url.searchParams.set("host", input.host);
  url.searchParams.set("path", input.path);
  return url;
}

async function readPageResponse(response: Response): Promise<StorefrontPageResult> {
  const statusResult = statusToResult(response.status);
  if (statusResult !== null) {
    return statusResult;
  }
  if (!response.ok) {
    return { kind: "upstream_error" };
  }
  const parsed = storefrontPageSchema.safeParse(await response.json());
  if (!parsed.success) {
    console.error("[storefront] The page response did not match the read contract.", {
      issueCount: parsed.error.issues.length,
    });
    return { kind: "upstream_error" };
  }
  return { kind: "published", page: parsed.data };
}

export async function loadStorefrontPage(
  input: LoadStorefrontPageInput
): Promise<StorefrontPageResult> {
  try {
    const response = await fetch(buildPageUrl(input), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
    return await readPageResponse(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[storefront] The published page could not be loaded:", message);
    return { kind: "upstream_error" };
  }
}
