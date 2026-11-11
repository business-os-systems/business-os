import type { Metadata } from "next";
import { StorefrontStatePanel } from "@/components/storefront/state-panel";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

/**
 * Branded not-found for every unknown tenant address (FR-039). The page is
 * deliberately neutral: it names no tenant, links only to the current host's
 * home page and exposes no workspace, session or preview affordance.
 */
export default function NotFound() {
  return (
    <StorefrontStatePanel
      eyebrow="Website"
      title="Page not found"
      message="This address does not exist on this website. Check the link or return to the home page."
      homeLabel="Go to the home page"
    />
  );
}
