import React from "react";
import { PERMISSIONS } from "@suite/core";
import { AccessDenied } from "@/components/layout/access-denied";
import { StudioDestinationShell } from "@/components/studio/studio-destination-shell";
import { StudioInquiries } from "@/components/studio/studio-inquiries";
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
    capability: PERMISSIONS.WEBSITE_BUILDER.LEADS_READ,
  });
  if (access.kind === "denied") {
    return <AccessDenied reason={access.reason} />;
  }
  return (
    <StudioDestinationShell
      siteId={siteId}
      title="Enquiries"
      description="Form submissions captured by this website."
    >
      <StudioInquiries siteId={siteId} />
    </StudioDestinationShell>
  );
}
