"use client";

import { useState } from "react";
import { Alert } from "@suite/ui";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import { canManageLifecycle } from "@/components/forms/lifecycle-form.config";
import { CapabilityDeniedView } from "@/components/states/view-state";
import { useTenantRecord } from "../tenant-record-context";
import { TenantDangerPanel } from "./tenant-danger-panel";
import { TenantSitesPanel } from "./tenant-sites-panel";

export default function TenantDangerPage() {
  const { record, reload } = useTenantRecord();
  const { session } = usePlatformAuth();
  const [notice, setNotice] = useState<string | null>(null);
  const capabilities = session?.capabilities ?? [];
  if (!canManageLifecycle(capabilities)) {
    return (
      <CapabilityDeniedView message="Your operator account cannot manage the tenant lifecycle." />
    );
  }
  return (
    <div className="space-y-4">
      {notice === null ? null : (
        <Alert
          variant="success"
          message={notice}
          dismissible
          onDismiss={() => setNotice(null)}
        />
      )}
      <TenantDangerPanel
        tenant={record.profile}
        onApplied={(message) => {
          setNotice(message);
          reload();
        }}
        onReload={reload}
      />
      <TenantSitesPanel
        organizationId={record.profile.id}
        onApplied={(message) => setNotice(message)}
      />
    </div>
  );
}
