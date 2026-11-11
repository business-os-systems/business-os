import React from "react";
import { PERMISSIONS } from "@suite/core";
import { requireAuth } from "@/lib/auth-guard";
import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";
import { AccessDenied } from "@/components/layout/access-denied";

/**
 * Fail-closed gate for every Website Builder destination. A tenant without the
 * installed application is denied here before any page can render an empty
 * list or studio (FR-013, FR-128).
 */
export default async function WebsitesLayout({
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
