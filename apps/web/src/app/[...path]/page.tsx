import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StorefrontPageView } from "@/components/storefront/page-view";
import { metadataForPage } from "@/lib/storefront/metadata";
import { toStorefrontPath } from "@/lib/storefront/path";
import { loadRequestedPage } from "@/lib/storefront/request-page";

interface StorefrontRouteProps {
  readonly params: Promise<{ readonly path?: readonly string[] }>;
}

async function readPath(props: StorefrontRouteProps): Promise<string | null> {
  const { path } = await props.params;
  return toStorefrontPath(path);
}

export async function generateMetadata(props: StorefrontRouteProps): Promise<Metadata> {
  const path = await readPath(props);
  if (path === null) {
    return metadataForPage({ kind: "not_found" });
  }
  return metadataForPage(await loadRequestedPage(path));
}

/**
 * Storefront page renderer (T074). The catch-all never claims workspace, auth,
 * API, preview or metadata addresses; those return the neutral not-found.
 */
export default async function StorefrontPage(props: StorefrontRouteProps) {
  const path = await readPath(props);
  if (path === null) {
    notFound();
  }
  const result = await loadRequestedPage(path);
  if (result.kind !== "published") {
    notFound();
  }
  return <StorefrontPageView page={result.page} />;
}
