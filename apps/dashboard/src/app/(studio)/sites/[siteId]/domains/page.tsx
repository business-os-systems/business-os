import React from "react";
import { getHostModelConfig, PERMISSIONS } from "@suite/core";
import { AccessDenied } from "@/components/layout/access-denied";
import { StudioDestinationShell } from "@/components/studio/studio-destination-shell";
import { StudioDomains } from "@/components/studio/studio-domains";
import { requireAuth } from "@/lib/auth-guard";
import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";

/** The host model is read per request, never baked at build time. */
export const dynamic = "force-dynamic";

export default async function StudioDestinationPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await requireAuth();
  const { siteId } = await params;
  const { tenantRootDomain } = getHostModelConfig();
  const access = await evaluateWebsiteBuilderAccess({
    actor: session,
    capability: PERMISSIONS.WEBSITE_BUILDER.SITES_READ,
  });
  if (access.kind === "denied") {
    return <AccessDenied reason={access.reason} />;
  }
  return (
    <StudioDestinationShell
      siteId={siteId}
      title="Domains"
      description="The addresses that serve this website."
    >
      <StudioDomains siteId={siteId} tenantRootDomain={tenantRootDomain} />
    </StudioDestinationShell>
  );
}
