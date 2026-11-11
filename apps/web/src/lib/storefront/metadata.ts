import type { Metadata } from "next";
import type { StorefrontPageResult } from "@/lib/storefront/page-client";

/**
 * Per-page metadata for published content. A holding, gone or failed read is
 * always non-indexed and never exposes the reason or a tenant identifier.
 */
export function metadataForPage(result: StorefrontPageResult): Metadata {
  if (result.kind !== "published") {
    return {
      title: "Website unavailable",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: result.page.title,
    description: result.page.ast.meta?.description,
    robots: { index: true, follow: true },
  };
}
