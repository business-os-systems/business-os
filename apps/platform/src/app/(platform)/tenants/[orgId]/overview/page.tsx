"use client";

import { usePlatformAuth } from "@/components/auth/auth-provider";
import { CapabilityDeniedView } from "@/components/states/view-state";
import { canReadTenants } from "@/lib/capability";
import { canReadPersonalData } from "@/lib/tenant-api";
import { useTenantRecord } from "../tenant-record-context";
import { TenantOverviewPanel } from "../tenant-overview-panel";
import { TenantPiiPanel } from "../tenant-pii-panel";

export default function TenantOverviewPage() {
  const { record } = useTenantRecord();
  const { session } = usePlatformAuth();
  const capabilities = session?.capabilities ?? [];
  if (!canReadTenants(capabilities)) {
    return (
      <CapabilityDeniedView message="Your operator account cannot read tenant records." />
    );
  }
  return (
    <TenantOverviewPanel
      record={record}
      personalDataSlot={
        <TenantPiiPanel
          key={record.profile.id}
          orgId={record.profile.id}
          canRead={canReadPersonalData(capabilities)}
        />
      }
    />
  );
}
