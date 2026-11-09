"use client";

import { useCallback, useEffect, useState } from "react";
import { toMessage } from "./error-message";
import { useRequestTicket } from "./use-request-ticket";

export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

/**
 * The first page of a cursor list. A request ticket discards a slow answer from
 * a superseded page, so rows never belong to a query the caller left. Private to
 * the module: the public hook owns appending against this state.
 */
function useCursorFirstPage<T>(
  loadPage: (cursor?: string) => Promise<CursorPage<T>>,
  enabled: boolean,
) {
  const [items, setItems] = useState<readonly T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestTicket = useRequestTicket();

  const reload = useCallback(async () => {
    const current = requestTicket.begin();
    setIsLoading(true);
    setError(null);
    setItems([]);
    setCursor(null);
    try {
      const page = await loadPage(undefined);
      if (requestTicket.isCurrent(current)) {
        setItems(page.items);
        setCursor(page.nextCursor);
      }
    } catch (cause) {
      if (requestTicket.isCurrent(current)) {
        setError(toMessage(cause));
      }
    } finally {
      if (requestTicket.isCurrent(current)) {
        setIsLoading(false);
      }
    }
  }, [loadPage, requestTicket]);

  useEffect(() => {
    if (enabled) {
      void reload();
    }
  }, [enabled, reload]);

  return {
    items,
    cursor,
    isLoading,
    error,
    requestTicket,
    setItems,
    setCursor,
    setError,
    reload,
  };
}

/**
 * One cursor-paged list state machine: first page, append, loading/error and a
 * stable setter for local row updates. The loader must be memoized by callers.
 */
export function useCursorPage<T>(
  loadPage: (cursor?: string) => Promise<CursorPage<T>>,
  enabled = true,
) {
  const firstPage = useCursorFirstPage(loadPage, enabled);
  const [isAppending, setIsAppending] = useState(false);
  const { cursor, requestTicket, setCursor, setError, setItems } = firstPage;

  async function loadMore(): Promise<void> {
    if (cursor === null) {
      return;
    }
    const current = requestTicket.current();
    setIsAppending(true);
    setError(null);
    try {
      const page = await loadPage(cursor);
      if (requestTicket.isCurrent(current)) {
        setItems((existing) => [...existing, ...page.items]);
        setCursor(page.nextCursor);
      }
    } catch (cause) {
      if (requestTicket.isCurrent(current)) {
        setError(toMessage(cause));
      }
    } finally {
      setIsAppending(false);
    }
  }

  return {
    items: firstPage.items,
    cursor,
    isLoading: firstPage.isLoading,
    isAppending,
    error: firstPage.error,
    setError,
    reload: firstPage.reload,
    loadMore,
  };
}
