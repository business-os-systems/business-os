"use client";

import { useCallback, useEffect, useState } from "react";
import { describeCmsError, getSite, type CmsSiteDto } from "@/lib/api/site-client";

export type SiteRecordState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly site: CmsSiteDto };

/** Loads one site for a studio destination; the API enforces the tenant boundary. */
export function useSiteRecord(siteId: string): {
  readonly state: SiteRecordState;
  readonly reload: () => void;
} {
  const [state, setState] = useState<SiteRecordState>({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    getSite(siteId)
      .then((site) => {
        if (!cancelled) {
          setState({ kind: "ready", site });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ kind: "error", message: describeCmsError(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, refreshKey]);

  const reload = useCallback(() => setRefreshKey((key) => key + 1), []);
  return { state, reload };
}
