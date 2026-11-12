import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StorefrontStatePanel } from "@/components/storefront/state-panel";
import { StorefrontPageView } from "@/components/storefront/page-view";
import { metadataForPage } from "@/lib/storefront/metadata";
import {
  readPreviewToken,
  type StorefrontSearchParams,
} from "@/lib/storefront/preview";
import { loadRequestedPage } from "@/lib/storefront/request-page";

export async function generateMetadata(props: {
  readonly searchParams: StorefrontSearchParams;
}): Promise<Metadata> {
  const previewToken = await readPreviewToken(props.searchParams);
  return metadataForPage(await loadRequestedPage("/", previewToken), previewToken !== null);
}

/**
 * The tenant host root (T074, FR-035). The host is read from the request, and
 * only a published home page renders; everything else falls to the neutral
 * holding page.
 */
export default async function StorefrontRootPage(props: {
  readonly searchParams: StorefrontSearchParams;
}) {
  const previewToken = await readPreviewToken(props.searchParams);
  const result = await loadRequestedPage("/", previewToken);
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
