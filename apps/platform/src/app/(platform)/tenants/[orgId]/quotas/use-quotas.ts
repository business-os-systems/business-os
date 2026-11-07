"use client";

import { useCallback, useEffect, useState } from "react";
import { isAbortError } from "@/lib/abort";
import { toViewProblem, type ViewProblem } from "@/lib/problem-view";
import { fetchTenantQuotas, type QuotaItem } from "@/lib/quotas-api";

export type QuotaEditorState =
  | { readonly mode: "closed" }
  | { readonly mode: "create" }
  | { readonly mode: "edit"; readonly quota: QuotaItem };

export function editorQuota(editor: QuotaEditorState): QuotaItem | null {
  return editor.mode === "edit" ? editor.quota : null;
}

export function useQuotas(orgId: string, enabled: boolean) {
  const [items, setItems] = useState<readonly QuotaItem[] | null>(null);
  const [problem, setProblem] = useState<ViewProblem | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setProblem(null);
      try {
        setItems(await fetchTenantQuotas(orgId, signal));
      } catch (cause) {
        if (isAbortError(cause)) return;
        setProblem(toViewProblem(cause));
      }
    },
    [orgId]
  );

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [enabled, load]);

  return { items, problem, load, setItems };
}
