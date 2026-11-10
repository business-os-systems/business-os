"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import {
  CapabilityDeniedView,
  PlatformViewState,
} from "@/components/states/view-state";
import { canAuthorApps, canReadApps } from "@/lib/capability";
import { isAbortError } from "@/lib/abort";
import {
  fetchAppSettingsDefaults,
  type AppSettingsDefaultsView,
  type AppSettingsDefaultsWriteResult,
} from "@/lib/app-settings-defaults-api";
import { toViewProblem, type ViewProblem } from "@/lib/problem-view";
import { useAppRecord } from "../app-record-context";
import { AppSettingsDefaultsPanel } from "./app-settings-defaults-panel";

export default function AppRecordSettingsPage() {
  const { app } = useAppRecord();
  const { session } = usePlatformAuth();
  const capabilities = session?.capabilities ?? [];
  const [defaults, setDefaults] = useState<AppSettingsDefaultsView | null>(null);
  const [problem, setProblem] = useState<ViewProblem | null>(null);
  const allowed = canReadApps(capabilities);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      setDefaults(await fetchAppSettingsDefaults(app.appId));
    } catch (cause) {
      if (isAbortError(cause)) return;
      setProblem(toViewProblem(cause));
    }
  }, [app.appId]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (!allowed) {
    return (
      <CapabilityDeniedView message="Your operator account cannot read application settings." />
    );
  }
  if (problem !== null) {
    return (
      <PlatformViewState
        state={{ kind: "error", problem, onRetry: () => void load() }}
      />
    );
  }
  if (defaults === null) {
    return (
      <PlatformViewState
        state={{ kind: "loading", label: "Loading application defaults..." }}
      />
    );
  }

  const onSaved = (result: AppSettingsDefaultsWriteResult): void => {
    setDefaults(result);
  };

  return (
    <AppSettingsDefaultsPanel
      appId={app.appId}
      defaults={defaults}
      canAuthor={canAuthorApps(capabilities)}
      onSaved={onSaved}
      onReload={() => void load()}
    />
  );
}
