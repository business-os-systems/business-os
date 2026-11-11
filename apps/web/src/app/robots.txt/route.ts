import { resolveMetadataOrigin } from "@/lib/storefront/origin";
import { metadataNotFoundResponse, metadataResponse } from "@/lib/storefront/responses";
import { buildRobotsTxt } from "@/lib/storefront/robots";

const ROBOTS_CONTENT_TYPE = "text/plain; charset=utf-8";

/**
 * Per-host robots directives (FR-040, FR-115). Workspace, API, preview, auth
 * and framework metadata paths are excluded on every tenant host and the
 * sitemap is referenced at the same verified origin.
 */
export function GET(request: Request): Response {
  const tenant = resolveMetadataOrigin(request);
  if (tenant === null) {
    return metadataNotFoundResponse();
  }
  return metadataResponse(buildRobotsTxt(tenant.origin), ROBOTS_CONTENT_TYPE);
}

export const dynamic = "force-dynamic";
