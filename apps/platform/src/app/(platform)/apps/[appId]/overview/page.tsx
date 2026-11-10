"use client";

import { usePlatformAuth } from "@/components/auth/auth-provider";
import { CapabilityDeniedView } from "@/components/states/view-state";
import { canReadApps } from "@/lib/capability";
import { AppOverviewPanel } from "../app-overview-panel";
import { useAppRecord } from "../app-record-context";

export default function AppRecordOverviewPage() {
  const { app } = useAppRecord();
  const { session } = usePlatformAuth();
  const capabilities = session?.capabilities ?? [];

  if (!canReadApps(capabilities)) {
    return (
      <CapabilityDeniedView message="Your operator account cannot read application records." />
    );
  }

  return <AppOverviewPanel app={app} />;
}
