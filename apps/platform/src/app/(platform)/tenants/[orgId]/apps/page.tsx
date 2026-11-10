"use client";

import { usePlatformAuth } from "@/components/auth/auth-provider";
import { CapabilityDeniedView } from "@/components/states/view-state";
import { canManageEntitlements, canReadTenants } from "@/lib/capability";
import { useTenantRecord } from "../tenant-record-context";
import { TenantAppsPanel } from "./tenant-apps-panel";

export default function TenantAppsPage() {
  const { record } = useTenantRecord();
  const { session } = usePlatformAuth();
  const capabilities = session?.capabilities ?? [];
  if (!canReadTenants(capabilities)) {
    return (
      <CapabilityDeniedView message="Your operator account cannot read tenant records." />
    );
  }
  return (
    <TenantAppsPanel
      orgId={record.profile.id}
      apps={record.apps}
      canManage={canManageEntitlements(capabilities)}
    />
  );
}
