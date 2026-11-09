"use client";

import { usePlatformAuth } from "@/components/auth/auth-provider";
import { CapabilityDeniedView } from "@/components/states/view-state";
import { canReadTenants } from "@/lib/capability";
import { canReadPersonalData } from "@/lib/tenant-api";
import { useTenantRecord } from "../tenant-record-context";
import { TenantAuditPanel } from "../tenant-audit-panel";

export default function TenantActivityPage() {
  const { record } = useTenantRecord();
  const { session } = usePlatformAuth();
  const capabilities = session?.capabilities ?? [];
  if (!canReadTenants(capabilities)) {
    return (
      <CapabilityDeniedView message="Your operator account cannot read tenant records." />
    );
  }
  return (
    <TenantAuditPanel
      lifecycle={record.lifecycle}
      audit={record.recentAudit}
      lifecycleHasMore={record.lifecycleHasMore}
      canReadReason={canReadPersonalData(capabilities)}
    />
  );
}
