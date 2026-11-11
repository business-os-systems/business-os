import React from "react";
import { PERMISSIONS } from "@suite/core";
import { AccessDenied } from "@/components/layout/access-denied";
import { requireAuth } from "@/lib/auth-guard";
import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";

/**
 * The review surface is the only place a site can be published, so it carries
 * its own fail-closed installation gate in addition to the enclosing studio
 * boundary. A workspace without the application never reaches review (FR-013).
 */
export default async function ReviewLayout({
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
