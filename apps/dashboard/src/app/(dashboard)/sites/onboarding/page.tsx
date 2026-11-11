import React from "react";
import { getHostModelConfig } from "@suite/core";
import { CreateSiteWizardLoader } from "@/components/sites/create-site-wizard";

/** The host model must be read per request, not baked at build time. */
export const dynamic = "force-dynamic";

/**
 * The one create-site surface. It renders the config-driven wizard against the
 * tenant CMS API and opens the studio on the new home page (FR-078).
 */
export default function SiteOnboardingPage() {
  const { tenantRootDomain } = getHostModelConfig();
  if (tenantRootDomain === null) {
    return (
      <div className="mx-auto max-w-3xl py-8">
        <p
          role="alert"
          className="rounded-lg border border-danger bg-surface p-4 text-sm font-medium text-danger"
        >
          The tenant host root is not configured for this deployment, so a site address cannot be
          issued.
        </p>
      </div>
    );
  }
  return <CreateSiteWizardLoader domainRoot={tenantRootDomain} />;
}
