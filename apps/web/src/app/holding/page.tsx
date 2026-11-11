import type { Metadata } from "next";
import { StorefrontStatePanel } from "@/components/storefront/state-panel";

export const metadata: Metadata = {
  title: "Website unavailable",
  robots: { index: false, follow: false },
};

/**
 * Neutral holding surface for a tenant host with nothing published yet
 * (FR-039, FR-116). It never invites a visitor to sign in and never reveals
 * whether another tenant exists.
 */
export default function HoldingPage() {
  return (
    <StorefrontStatePanel
      eyebrow="Website"
      title="This website is not available yet"
      message="The owner is still preparing this site. Please check back later."
      homeLabel="Return to the home page"
    />
  );
}
