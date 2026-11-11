"use client";

import { useCallback, useEffect, useState } from "react";
import { getPageContent } from "@/lib/api/cms-editor-client";
import type { PageContentSnapshot } from "@suite/website-builder/editor";

export type PageContentState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly content: PageContentSnapshot };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Loads the tenant-scoped draft that the autosave controller edits. */
export function usePageContent(pageId: string): {
  readonly state: PageContentState;
  readonly reload: () => Promise<void>;
} {
  const [state, setState] = useState<PageContentState>({ kind: "loading" });

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const content = await getPageContent(pageId);
      setState({ kind: "ready", content });
    } catch (error: unknown) {
      setState({ kind: "error", message: messageOf(error) });
    }
  }, [pageId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload };
}
