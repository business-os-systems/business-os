"use client";

import { usePlatformAuth } from "@/components/auth/auth-provider";
import { CapabilityDeniedView } from "@/components/states/view-state";
import { canManageEntitlements, canReadTenants } from "@/lib/capability";
import { useTenantRecord } from "../tenant-record-context";
import { AppSettingsSection } from "./app-settings-section";
import { InstalledAppsGrid } from "./installed-apps-grid";

export default function TenantAppsPage() {
  const { record } = useTenantRecord();
  const { session } = usePlatformAuth();
  const capabilities = session?.capabilities ?? [];
  if (!canReadTenants(capabilities)) {
    return (
      <CapabilityDeniedView message="Your operator account cannot read tenant records." />
    );
  }
  const canManage = canManageEntitlements(capabilities);
  return (
    <div className="space-y-4">
      <InstalledAppsGrid
        apps={record.apps}
        canManageEntitlements={canManage}
      />
      {canManage ? (
        <AppSettingsSection orgId={record.profile.id} apps={record.apps} />
      ) : null}
    </div>
  );
}
