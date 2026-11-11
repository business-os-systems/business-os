import React from "react";
import { PERMISSIONS } from "@suite/core";
import { AccessDenied } from "@/components/layout/access-denied";
import { requireAuth } from "@/lib/auth-guard";
import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";

/**
 * Fail-closed gate for every studio surface. A workspace without the installed
 * application is denied before the canvas, review or appearance route renders,
 * never shown an empty studio (FR-013).
 */
export default async function StudioLayout({
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
  return (
    <div data-app="website-builder" className="h-screen w-screen overflow-hidden bg-background">
      {children}
    </div>
  );
}
