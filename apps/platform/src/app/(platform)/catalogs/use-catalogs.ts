"use client";

import { useCallback, useEffect, useState } from "react";
import { isAbortError } from "@/lib/abort";
import { withCatalogValue } from "@/components/catalogs/catalogs.config";
import { fetchCatalogs, type Catalog, type CatalogValue } from "@/lib/catalogs-api";
import { toViewProblem, type ViewProblem } from "@/lib/problem-view";

export interface UseCatalogsOptions {
  readonly enabled: boolean;
}

export interface CatalogsResource {
  readonly catalogs: readonly Catalog[] | null;
  readonly problem: ViewProblem | null;
  readonly reload: () => void;
  readonly applyValue: (catalogKey: string, value: CatalogValue) => void;
}

/** One catalog read per hub; local updates avoid a full reload flash. */
export function useCatalogs({
  enabled,
}: UseCatalogsOptions): CatalogsResource {
  const [catalogs, setCatalogs] = useState<readonly Catalog[] | null>(null);
  const [problem, setProblem] = useState<ViewProblem | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setProblem(null);
    try {
      setCatalogs(await fetchCatalogs(signal));
    } catch (cause) {
      if (isAbortError(cause)) return;
      setProblem(toViewProblem(cause));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [enabled, load]);

  const applyValue = useCallback(
    (catalogKey: string, value: CatalogValue) => {
      setCatalogs((current) =>
        current === null
          ? current
          : current.map((catalog) =>
              catalog.key === catalogKey
                ? withCatalogValue(catalog, value)
                : catalog,
            ),
      );
    },
    [],
  );

  return { catalogs, problem, reload: () => void load(), applyValue };
}
