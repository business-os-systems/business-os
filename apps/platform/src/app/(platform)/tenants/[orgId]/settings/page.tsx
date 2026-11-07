"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import {
  CapabilityDeniedView,
  PlatformViewState,
} from "@/components/states/view-state";
import { canManageEntitlements } from "@/lib/capability";
import type { AppSettingsWriteResult } from "@/lib/app-settings-api";
import { settingsGateState } from "./settings-gate";
import { SettingsHeader } from "./settings-header";
import { SettingsReady } from "./settings-ready";
import {
  registeredApps,
  useAppSettings,
  useInstalledApps,
} from "./use-tenant-settings";

export default function TenantSettingsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const { session } = usePlatformAuth();
  const allowed = canManageEntitlements(session?.capabilities);
  const installed = useInstalledApps(orgId, allowed);
  const [requestedAppId, setRequestedAppId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const apps = installed.apps ?? [];
  const selectedAppId = apps.some((app) => app.appId === requestedAppId)
    ? requestedAppId
    : (apps[0]?.appId ?? "");
  const settings = useAppSettings(orgId, selectedAppId, allowed);
  const gate = settingsGateState(installed, apps);

  function applySaved(result: AppSettingsWriteResult): void {
    settings.applyWriteResult(result);
    setNotice(
      result.removedFields.length === 0
        ? "Settings saved."
        : `Settings saved. Removed: ${result.removedFields.join(", ")}.`
    );
  }

  if (!allowed) {
    return (
      <CapabilityDeniedView message="Your operator account cannot manage app settings." />
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      <SettingsHeader orgId={orgId} />
      {gate === null ? (
        <SettingsReady
          orgId={orgId}
          apps={apps}
          selectedAppId={selectedAppId}
          notice={notice}
          settings={settings}
          onSelect={(next) => {
            setNotice(null);
            setRequestedAppId(next);
          }}
          onSaved={applySaved}
          onEntitlementsUpdated={(next) => installed.setApps(registeredApps(next))}
        />
      ) : (
        <PlatformViewState state={gate} />
      )}
    </div>
  );
}
