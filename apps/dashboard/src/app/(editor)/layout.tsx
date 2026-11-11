import React from "react";
import { PERMISSIONS } from "@suite/core";
import { requireAuth } from "@/lib/auth-guard";
import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";
import { AccessDenied } from "@/components/layout/access-denied";

export default async function EditorLayout({
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
    <div
      data-app="website-builder"
      className="h-screen w-screen overflow-hidden flex flex-col bg-inverse-surface"
    >
      {children}
    </div>
  );
}
