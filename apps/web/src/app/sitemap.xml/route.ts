import { resolveMetadataOrigin } from "@/lib/storefront/origin";
import {
  metadataFailureResponse,
  metadataNotFoundResponse,
  metadataResponse,
} from "@/lib/storefront/responses";
import { fetchSitemap, renderSitemapXml } from "@/lib/storefront/sitemap";

const SITEMAP_CONTENT_TYPE = "application/xml; charset=utf-8";

/**
 * Per-host sitemap (FR-040, FR-042, FR-115). The request host is validated
 * against the declared host model; tables from another host are never read and
 * the response is cacheable only under that host.
 */
export async function GET(request: Request): Promise<Response> {
  const tenant = resolveMetadataOrigin(request);
  if (tenant === null) {
    return metadataNotFoundResponse();
  }
  const result = await fetchSitemap(tenant.hostname);
  switch (result.kind) {
    case "ok":
      return metadataResponse(renderSitemapXml(tenant.origin, result.data), SITEMAP_CONTENT_TYPE);
    case "unavailable":
      return metadataNotFoundResponse();
    case "upstream_error":
      return metadataFailureResponse();
  }
}

export const dynamic = "force-dynamic";
