"use client";

import { usePlatformAuth } from "@/components/auth/auth-provider";
import { CatalogRolloutPanel } from "@/components/catalog/catalog-rollout-panel";
import { CapabilityDeniedView } from "@/components/states/view-state";
import { canReadApps } from "@/lib/capability";
import { useAppRecord } from "../app-record-context";

export default function AppRecordRolloutPage() {
  const { app, reload } = useAppRecord();
  const { session } = usePlatformAuth();
  const capabilities = session?.capabilities ?? [];

  if (!canReadApps(capabilities)) {
    return (
      <CapabilityDeniedView message="Your operator account cannot read the application rollout." />
    );
  }

  return <CatalogRolloutPanel app={app} capabilities={capabilities} onAppChanged={reload} />;
}
