"use client";

import { useCallback, useEffect, useState } from "react";
import { toMessage } from "./error-message";

export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

/**
 * One cursor-paged list state machine: first page, append, loading/error and a
 * stable setter for local row updates. The loader must be memoized by callers.
 */
export function useCursorPage<T>(
  loadPage: (cursor?: string) => Promise<CursorPage<T>>,
  enabled = true,
) {
  const [items, setItems] = useState<readonly T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAppending, setIsAppending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirstPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setItems([]);
    setCursor(null);
    try {
      const page = await loadPage(undefined);
      setItems(page.items);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setIsLoading(false);
    }
  }, [loadPage]);

  useEffect(() => {
    if (enabled) {
      void loadFirstPage();
    }
  }, [enabled, loadFirstPage]);

  async function loadMore(): Promise<void> {
    if (cursor === null) {
      return;
    }
    setIsAppending(true);
    setError(null);
    try {
      const page = await loadPage(cursor);
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setIsAppending(false);
    }
  }

  return {
    items,
    cursor,
    isLoading,
    isAppending,
    error,
    setError,
    reload: loadFirstPage,
    loadMore,
  };
}
