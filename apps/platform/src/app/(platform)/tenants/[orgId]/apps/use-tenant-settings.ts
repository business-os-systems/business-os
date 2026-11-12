"use client";

import { useCallback, useEffect, useState } from "react";
import { isAbortError } from "@/lib/abort";
import { toViewProblem, type ViewProblem } from "@/lib/problem-view";
import {
  fetchAppSettings,
  type AppSettingsView,
  type AppSettingsWriteResult,
} from "@/lib/app-settings-api";

/**
 * Panel-scoped application settings. The tenant record itself is fetched once
 * by the hub layout; only the selected application's schema is read here.
 */
export function useAppSettings(orgId: string, appId: string) {
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
    if (appId === "") return;
    const controller = new AbortController();
    void load(appId, controller.signal);
    return () => controller.abort();
  }, [appId, load]);

  function applyWriteResult(result: AppSettingsWriteResult): void {
    setSettings((current) =>
      current === null
        ? current
        : {
            ...current,
            values: result.values,
            effectiveValues: result.effectiveValues,
            sources: result.sources,
            staleFields: result.staleFields,
            version: result.version,
          }
    );
  }

  return { settings, problem, load, applyWriteResult };
}
