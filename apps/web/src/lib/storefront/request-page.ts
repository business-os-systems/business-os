import { cache } from "react";
import { headers } from "next/headers";
import { readNormalizedRequestHost } from "@suite/core";
import {
  loadStorefrontPage,
  loadStorefrontPreviewPage,
  type StorefrontPageResult,
} from "@/lib/storefront/page-client";

/**
 * Reads the authoritative request host and loads the requested page.
 *
 * Host comes from the request Host header only: page address, query and custom
 * headers can never select a different tenant. react cache deduplicates the
 * load between generateMetadata and the page render in one request.
 */
export const loadRequestedPage = cache(
  async (path: string, previewToken: string | null): Promise<StorefrontPageResult> => {
    const requestHeaders = await headers();
    const host = readNormalizedRequestHost({ headers: requestHeaders, fallbackHost: null });
    if (host === null) {
      return { kind: "not_found" };
    }
    if (previewToken === null) {
      return loadStorefrontPage({ host, path });
    }
    return loadStorefrontPreviewPage({ host, path, token: previewToken });
  }
);
