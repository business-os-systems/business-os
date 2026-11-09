"use client";

import { useState } from "react";
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
} from "@suite/ui";
import { getAppSettingsDefinition } from "@suite/core";
import { PlatformViewState } from "@/components/states/view-state";
import type { AppSettingsWriteResult } from "@/lib/app-settings-api";
import { appDisplayTitle } from "@/lib/apps-api";
import { SettingsPanel } from "./settings-panel";
import { useAppSettings } from "./use-tenant-settings";

const SETTINGS_SELECT_ID = "tenant-app-settings";

function AppSelector({
  apps,
  selectedAppId,
  onSelect,
}: {
  readonly apps: readonly string[];
  readonly selectedAppId: string;
  readonly onSelect: (appId: string) => void;
}) {
  return (
    <div className="max-w-md space-y-1.5">
      <Label htmlFor={SETTINGS_SELECT_ID}>Application</Label>
      <Select
        id={SETTINGS_SELECT_ID}
        value={selectedAppId}
        options={apps.map((appId) => ({
          value: appId,
          label: appDisplayTitle(appId),
        }))}
        onChange={onSelect}
      />
    </div>
  );
}

function savedNotice(result: AppSettingsWriteResult): string {
  return result.removedFields.length === 0
    ? "Settings saved."
    : `Settings saved. Removed: ${result.removedFields.join(", ")}.`;
}

export function AppSettingsSection({
  orgId,
  apps,
}: {
  readonly orgId: string;
  readonly apps: readonly string[];
}) {
  const settingsApps = apps.filter(
    (appId) => getAppSettingsDefinition(appId) !== null
  );
  const [requestedAppId, setRequestedAppId] = useState("");
  const selectedAppId = settingsApps.includes(requestedAppId)
    ? requestedAppId
    : (settingsApps[0] ?? "");
  const settings = useAppSettings(orgId, selectedAppId);
  const [notice, setNotice] = useState<string | null>(null);

  if (settingsApps.length === 0) {
    return (
      <PlatformViewState
        state={{
          kind: "empty",
          title: "No configurable application",
          description:
            "No installed application declares a settings schema for this tenant.",
        }}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Application settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <AppSelector
          apps={settingsApps}
          selectedAppId={selectedAppId}
          onSelect={(next) => {
            setNotice(null);
            setRequestedAppId(next);
          }}
        />
        {notice === null ? null : <Alert variant="success" message={notice} />}
        <SettingsPanel
          orgId={orgId}
          appId={selectedAppId}
          settings={settings.settings}
          problem={settings.problem}
          onRetry={() => void settings.load(selectedAppId)}
          onSaved={(result) => {
            settings.applyWriteResult(result);
            setNotice(savedNotice(result));
          }}
        />
      </CardContent>
    </Card>
  );
}
