import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StorefrontStatePanel } from "@/components/storefront/state-panel";
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
  if (result.kind === "published") {
    return <StorefrontPageView page={result.page} />;
  }
  if (result.kind === "gone") {
    return (
      <StorefrontStatePanel
        eyebrow="Website"
        title="Website unavailable"
        message="This website is no longer available."
        homeLabel="Go to the home page"
      />
    );
  }
  if (result.kind === "upstream_error") {
    return (
      <StorefrontStatePanel
        eyebrow="Website"
        title="Website unavailable"
        message="This website cannot be served right now."
        homeLabel="Go to the home page"
      />
    );
  }
  notFound();
}
