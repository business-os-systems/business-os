"use client";

import { useCallback, useEffect, useState } from "react";
import { getAppManifest } from "@suite/core";
import { isAbortError } from "@/lib/abort";
import { toViewProblem, type ViewProblem } from "@/lib/problem-view";
import {
  fetchTenantEntitlements,
  type TenantEntitlement,
} from "@/lib/apps-api";
import {
  fetchAppSettings,
  type AppSettingsView,
  type AppSettingsWriteResult,
} from "@/lib/app-settings-api";

export function registeredApps(
  apps: readonly TenantEntitlement[]
): readonly TenantEntitlement[] {
  return apps.filter((app) => getAppManifest(app.appId) !== undefined);
}

export function useInstalledApps(orgId: string, enabled: boolean) {
  const [apps, setApps] = useState<readonly TenantEntitlement[] | null>(null);
  const [problem, setProblem] = useState<ViewProblem | null>(null);
  const load = useCallback(async () => {
    setProblem(null);
    try {
      setApps(registeredApps(await fetchTenantEntitlements(orgId)));
    } catch (cause) {
      setProblem(toViewProblem(cause));
    }
  }, [orgId]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  return { apps, problem, load, setApps };
}

export function useAppSettings(orgId: string, appId: string, enabled: boolean) {
  const [settings, setSettings] = useState<AppSettingsView | null>(null);
  const [problem, setProblem] = useState<ViewProblem | null>(null);
  const load = useCallback(
    async (targetAppId: string, signal?: AbortSignal) => {
      setSettings(null);
      setProblem(null);
      if (targetAppId === "") return;
      try {
        setSettings(await fetchAppSettings(orgId, targetAppId, signal));
      } catch (cause) {
        if (isAbortError(cause)) return;
        setProblem(toViewProblem(cause));
      }
    },
    [orgId]
  );

  useEffect(() => {
    if (!enabled || appId === "") return;
    const controller = new AbortController();
    void load(appId, controller.signal);
    return () => controller.abort();
  }, [enabled, appId, load]);

  function applyWriteResult(result: AppSettingsWriteResult): void {
    setSettings((current) =>
      current === null
        ? current
        : {
            ...current,
            values: result.values,
            staleFields: result.staleFields,
            version: result.version,
          }
    );
  }

  return { settings, problem, load, applyWriteResult };
}
