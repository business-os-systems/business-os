"use client";

import { Alert } from "@suite/ui";
import { AppSettingsSection } from "./app-settings-section";
import { InstalledAppsGrid } from "./installed-apps-grid";
import { useTenantEntitlements } from "./use-tenant-entitlements";

export function TenantAppsPanel({
  orgId,
  apps,
  canManage,
}: {
  readonly orgId: string;
  readonly apps: readonly string[];
  readonly canManage: boolean;
}) {
  const entitlements = useTenantEntitlements(orgId, apps);

  const enabledApps = entitlements.apps
    .filter((app) => app.isEnabled)
    .map((app) => app.appId);

  return (
    <div className="space-y-4">
      {entitlements.error === null ? null : (
        <Alert
          variant="error"
          title="Application update failed"
          message={entitlements.error}
        />
      )}
      <InstalledAppsGrid
        entitlements={entitlements.apps}
        canManageEntitlements={canManage}
        pendingAppId={entitlements.pendingAppId}
        onToggle={(app, enabled) => void entitlements.toggle(app, enabled)}
      />
      {canManage ? (
        <AppSettingsSection orgId={orgId} apps={enabledApps} />
      ) : null}
    </div>
  );
}
