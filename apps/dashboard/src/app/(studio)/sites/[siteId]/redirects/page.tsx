import React from "react";
import { PERMISSIONS } from "@suite/core";
import { AccessDenied } from "@/components/layout/access-denied";
import { StudioDestinationShell } from "@/components/studio/studio-destination-shell";
import { StudioRedirects } from "@/components/studio/studio-redirects";
import { requireAuth } from "@/lib/auth-guard";
import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";

export default async function StudioDestinationPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await requireAuth();
  const { siteId } = await params;
  const access = await evaluateWebsiteBuilderAccess({
    actor: session,
    capability: PERMISSIONS.WEBSITE_BUILDER.PAGES_READ,
  });
  if (access.kind === "denied") {
    return <AccessDenied reason={access.reason} />;
  }
  return (
    <StudioDestinationShell
      siteId={siteId}
      title="Redirects"
      description="Old page addresses that still resolve for visitors."
    >
      <StudioRedirects siteId={siteId} />
    </StudioDestinationShell>
  );
}
