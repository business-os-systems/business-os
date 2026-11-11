"use client";

import { usePlatformAuth } from "@/components/auth/auth-provider";
import { CatalogActivityPanel } from "@/components/catalog/catalog-activity-panel";
import { CapabilityDeniedView } from "@/components/states/view-state";
import { canReadApps } from "@/lib/capability";
import { useAppRecord } from "../app-record-context";

export default function AppRecordActivityPage() {
  const { app } = useAppRecord();
  const { session } = usePlatformAuth();
  const capabilities = session?.capabilities ?? [];

  if (!canReadApps(capabilities)) {
    return (
      <CapabilityDeniedView message="Your operator account cannot read the application activity." />
    );
  }

  return <CatalogActivityPanel appId={app.appId} />;
}
