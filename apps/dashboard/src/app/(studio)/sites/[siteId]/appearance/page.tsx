import React from "react";
import { PERMISSIONS } from "@suite/core";
import { AccessDenied } from "@/components/layout/access-denied";
import { AppearancePanel } from "@/components/studio/appearance-panel";
import { requireAuth } from "@/lib/auth-guard";
import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";

export interface AppearancePageProps {
  readonly params: Promise<{ readonly siteId: string }>;
}

/**
 * Site appearance surface (T116). The server gate verifies the installed app
 * and the cms:theme:manage capability before any appearance data is loaded;
 * the client panel never decides access for itself.
 */
export default async function AppearancePage({ params }: AppearancePageProps) {
  const session = await requireAuth();
  const siteAccess = await evaluateWebsiteBuilderAccess({
    actor: session,
    capability: PERMISSIONS.WEBSITE_BUILDER.SITES_READ,
  });
  if (siteAccess.kind === "denied") {
    return <AccessDenied reason={siteAccess.reason} backHref="/sites" backLabel="Back to websites" />;
  }
  const appearanceAccess = await evaluateWebsiteBuilderAccess({
    actor: session,
    capability: PERMISSIONS.WEBSITE_BUILDER.THEME_MANAGE,
  });
  if (appearanceAccess.kind === "denied") {
    return (
      <AccessDenied
        reason={appearanceAccess.reason}
        backHref="/sites"
        backLabel="Back to websites"
      />
    );
  }
  const { siteId } = await params;
  return <AppearancePanel siteId={siteId} permissions={appearanceAccess.permissions} />;
}
