"use client";

import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
} from "@suite/ui";
import { appDisplayTitle, type TenantEntitlement } from "@/lib/apps-api";
import type { AppSettingsWriteResult } from "@/lib/app-settings-api";
import { SettingsPanel } from "./settings-panel";
import { TenantEntitlementToggles } from "./tenant-entitlement-toggles";
import type { useAppSettings } from "./use-tenant-settings";

interface SettingsReadyProps {
  readonly orgId: string;
  readonly apps: readonly TenantEntitlement[];
  readonly selectedAppId: string;
  readonly notice: string | null;
  readonly settings: ReturnType<typeof useAppSettings>;
  readonly onSelect: (appId: string) => void;
  readonly onSaved: (result: AppSettingsWriteResult) => void;
  readonly onEntitlementsUpdated: (
    apps: readonly TenantEntitlement[]
  ) => void;
}

export function SettingsReady({
  orgId,
  apps,
  selectedAppId,
  notice,
  settings,
  onSelect,
  onSaved,
  onEntitlementsUpdated,
}: SettingsReadyProps) {
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Installed applications</CardTitle>
        </CardHeader>
        <CardContent>
          <TenantEntitlementToggles
            orgId={orgId}
            apps={apps}
            onUpdated={onEntitlementsUpdated}
          />
        </CardContent>
      </Card>
      <div className="max-w-md space-y-1.5">
        <Label htmlFor="settings-app">Application</Label>
        <Select
          id="settings-app"
          value={selectedAppId}
          options={apps.map((app) => ({
            value: app.appId,
            label: appDisplayTitle(app.appId),
          }))}
          onChange={onSelect}
        />
      </div>
      {notice === null ? null : <Alert variant="success" message={notice} />}
      <SettingsPanel
        orgId={orgId}
        appId={selectedAppId}
        settings={settings.settings}
        problem={settings.problem}
        onRetry={() => void settings.load(selectedAppId)}
        onSaved={onSaved}
      />
    </div>
  );
}
