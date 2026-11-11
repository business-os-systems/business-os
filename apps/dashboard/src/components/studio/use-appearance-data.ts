"use client";

import { useCallback, useEffect, useState } from "react";
import {
  describeCmsError,
  getSite,
  getSiteAppearance,
  listAppearanceThemes,
  type CmsAppearanceDto,
  type CmsAppearanceThemeDto,
  type CmsSiteDto,
} from "@/lib/api/site-client";

export interface AppearanceData {
  readonly site: CmsSiteDto | null;
  readonly appearance: CmsAppearanceDto | null;
  readonly themes: readonly CmsAppearanceThemeDto[];
  readonly isLoading: boolean;
  readonly error: string | null;
}

const INITIAL: AppearanceData = {
  site: null,
  appearance: null,
  themes: [],
  isLoading: true,
  error: null,
};

export interface AppearanceDataState {
  readonly data: AppearanceData;
  readonly setAppearance: (appearance: CmsAppearanceDto) => void;
  readonly setError: (error: string | null) => void;
  readonly reload: () => void;
}

/** Loads the site, its own appearance snapshot and the published theme catalog. */
export function useAppearanceData(siteId: string): AppearanceDataState {
  const [data, setData] = useState<AppearanceData>(INITIAL);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData((previous) => ({ ...previous, isLoading: true, error: null }));
    Promise.all([getSite(siteId), getSiteAppearance(siteId), listAppearanceThemes()])
      .then(([site, appearance, themes]) => {
        if (!cancelled) {
          setData({ site, appearance, themes, isLoading: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setData({ ...INITIAL, isLoading: false, error: describeCmsError(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, refreshKey]);

  const setAppearance = useCallback((appearance: CmsAppearanceDto) => {
    setData((previous) => ({ ...previous, appearance }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setData((previous) => ({ ...previous, error }));
  }, []);

  const reload = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  return { data, setAppearance, setError, reload };
}
