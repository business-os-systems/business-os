import type { StorefrontPage } from "@/lib/storefront/contract";
import { StorefrontRenderer } from "@/components/storefront-renderer";

export interface StorefrontPageViewProps {
  readonly page: StorefrontPage;
}

export function StorefrontPageView({ page }: StorefrontPageViewProps) {
  return (
    <StorefrontRenderer ast={page.ast} media={page.media} tokens={page.tokens} />
  );
}
