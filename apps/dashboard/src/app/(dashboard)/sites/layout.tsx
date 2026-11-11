import React from "react";
import { PERMISSIONS } from "@suite/core";
import { requireAuth } from "@/lib/auth-guard";
import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";
import { AccessDenied } from "@/components/layout/access-denied";

/**
 * The legacy /sites surfaces (page explorer and studio) belong to the same
 * application, so they share the fail-closed entitlement gate.
 */
export default async function SitesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();
  const access = await evaluateWebsiteBuilderAccess({
    actor: session,
    capability: PERMISSIONS.WEBSITE_BUILDER.SITES_READ,
  });
  if (access.kind === "denied") {
    return <AccessDenied reason={access.reason} />;
  }
  return <>{children}</>;
}
