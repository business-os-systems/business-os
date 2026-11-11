/**
 * Shared response headers for the per-host metadata routes (FR-040, FR-042).
 * A published metadata file is cacheable only under its host; a refusal is
 * never cached and is never indexed.
 */
export const METADATA_PUBLIC_CACHE =
  "public, s-maxage=3600, stale-while-revalidate=86400";
const METADATA_PRIVATE_CACHE = "private, no-store";
const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";

export function metadataResponse(body: string, contentType: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": METADATA_PUBLIC_CACHE,
      "X-Content-Type-Options": "nosniff",
      Vary: "Host",
    },
  });
}

export function metadataNotFoundResponse(): Response {
  return unavailableResponse(404, "Not found");
}

export function metadataFailureResponse(): Response {
  return unavailableResponse(503, "Unavailable");
}

function unavailableResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": TEXT_CONTENT_TYPE,
      "Cache-Control": METADATA_PRIVATE_CACHE,
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      Vary: "Host",
    },
  });
}
