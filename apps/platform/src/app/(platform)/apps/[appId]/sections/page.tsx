"use client";

import { usePlatformAuth } from "@/components/auth/auth-provider";
import { CatalogPanel } from "@/components/catalog/catalog-panel";
import { CapabilityDeniedView } from "@/components/states/view-state";
import { canReadApps } from "@/lib/capability";
import { useAppRecord } from "../app-record-context";

export default function CatalogSectionsPage() {
  const { app } = useAppRecord();
  const { session } = usePlatformAuth();

  if (!canReadApps(session?.capabilities)) {
    return (
      <CapabilityDeniedView message="Your operator account cannot read the application catalog." />
    );
  }

  return <CatalogPanel appId={app.appId} kind="SECTION" />;
}
