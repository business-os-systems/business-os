"use client";

import { useCallback, useEffect, useState } from "react";
import { listCatalogSections } from "@/lib/api/cms-editor-client";
import type { CatalogSection } from "@suite/website-builder/editor";

export type CatalogState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly sections: readonly CatalogSection[] };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Loads the tenant-visible section catalog; the drawer never invents rows. */
export function useCatalogSections(): {
  readonly state: CatalogState;
  readonly reload: () => Promise<void>;
} {
  const [state, setState] = useState<CatalogState>({ kind: "loading" });

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const sections = await listCatalogSections();
      setState({ kind: "ready", sections });
    } catch (error: unknown) {
      setState({ kind: "error", message: messageOf(error) });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload };
}
