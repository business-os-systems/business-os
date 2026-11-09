"use client";

import { PlatformViewState } from "@/components/states/view-state";
import type { AppSettingsView, AppSettingsWriteResult } from "@/lib/app-settings-api";
import type { ViewProblem } from "@/lib/problem-view";
import { AppSettingsEditor } from "./app-settings-editor";

export function SettingsPanel({
  orgId,
  appId,
  settings,
  problem,
  onRetry,
  onSaved,
}: {
  readonly orgId: string;
  readonly appId: string;
  readonly settings: AppSettingsView | null;
  readonly problem: ViewProblem | null;
  readonly onRetry: () => void;
  readonly onSaved: (result: AppSettingsWriteResult) => void;
}) {
  if (problem !== null) {
    return <PlatformViewState state={{ kind: "error", problem, onRetry }} />;
  }
  if (settings === null) {
    return (
      <PlatformViewState
        state={{ kind: "loading", label: "Loading application settings..." }}
      />
    );
  }
  return (
    <AppSettingsEditor
      key={`${appId}:${settings.version}`}
      orgId={orgId}
      settings={settings}
      onSaved={onSaved}
      onReload={onRetry}
    />
  );
}
