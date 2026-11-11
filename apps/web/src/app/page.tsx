import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StorefrontPageView } from "@/components/storefront/page-view";
import { metadataForPage } from "@/lib/storefront/metadata";
import { loadRequestedPage } from "@/lib/storefront/request-page";

export async function generateMetadata(): Promise<Metadata> {
  return metadataForPage(await loadRequestedPage("/"));
}

/**
 * The tenant host root (T074, FR-035). The host is read from the request, and
 * only a published home page renders; everything else falls to the neutral
 * holding page.
 */
export default async function StorefrontRootPage() {
  const result = await loadRequestedPage("/");
  if (result.kind !== "published") {
    notFound();
  }
  return <StorefrontPageView page={result.page} />;
}
