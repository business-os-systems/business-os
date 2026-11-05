"use client";

import { useCallback, useEffect, useState } from "react";
import { createIdempotencyKey } from "@/lib/api";
import { toMessage } from "@/lib/error-message";
import { useRequestTicket } from "@/lib/use-request-ticket";
import {
  fetchFlagPage,
  isFlagEnvironment,
  updateFlag,
  FLAG_PAGE_SIZE,
  type FlagEnvironment,
  type FlagRecord,
} from "@/lib/flags-api";

export const ENVIRONMENT_ALL = "all" as const;
export type EnvironmentFilter = typeof ENVIRONMENT_ALL | FlagEnvironment;

export function isEnvironmentFilter(value: string): value is EnvironmentFilter {
  return value === ENVIRONMENT_ALL || isFlagEnvironment(value);
}

/**
 * Flag list state with request tickets. A slow earlier answer cannot overwrite
 * a newer filter, and a mutation replaces only the row it changed.
 */
export function useFlags() {
  const [environment, setEnvironment] = useState<EnvironmentFilter>(ENVIRONMENT_ALL);
  const [rows, setRows] = useState<FlagRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAppending, setIsAppending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestTicket = useRequestTicket();

  const loadFirstPage = useCallback(async (filter: EnvironmentFilter) => {
    const current = requestTicket.begin();
    setIsLoading(true);
    setError(null);
    setRows([]);
    setCursor(null);

    try {
      const page = await fetchFlagPage({
        environment: filter === ENVIRONMENT_ALL ? undefined : filter,
        limit: FLAG_PAGE_SIZE,
      });
      if (!requestTicket.isCurrent(current)) {
        return;
      }
      setRows(page.items);
      setCursor(page.nextCursor);
    } catch (cause) {
      if (!requestTicket.isCurrent(current)) {
        return;
      }
      setError(toMessage(cause));
    } finally {
      if (requestTicket.isCurrent(current)) {
        setIsLoading(false);
      }
    }
  }, [requestTicket]);

  useEffect(() => {
    void loadFirstPage(environment);
  }, [environment, loadFirstPage]);

  async function loadMore(): Promise<void> {
    if (cursor === null) {
      return;
    }
    const current = requestTicket.current();
    setIsAppending(true);
    setError(null);
    try {
      const page = await fetchFlagPage({
        environment: environment === ENVIRONMENT_ALL ? undefined : environment,
        cursor,
        limit: FLAG_PAGE_SIZE,
      });
      if (!requestTicket.isCurrent(current)) {
        return;
      }
      setRows((existing) => [...existing, ...page.items]);
      setCursor(page.nextCursor);
    } catch (cause) {
      if (requestTicket.isCurrent(current)) {
        setError(toMessage(cause));
      }
    } finally {
      setIsAppending(false);
    }
  }

  function replaceFlag(flag: FlagRecord): void {
    setRows((current) =>
      current.map((row) => (row.id === flag.id ? flag : row))
    );
  }

  async function toggle(flag: FlagRecord): Promise<void> {
    if (!isFlagEnvironment(flag.environment)) {
      setError("The flag environment is not recognised. Reload the flag.");
      return;
    }
    setError(null);
    try {
      const updated = await updateFlag({
        key: flag.key,
        environment: flag.environment,
        body: {
          expectedVersion: flag.version,
          // The one-click toggle is the common case: master switch and
          // default fallback move together. The lifecycle modal can still set
          // the fallback off again for a targeted rollout.
          isEnabled: !flag.isEnabled,
          defaultEnabled: !flag.isEnabled,
          reason: flag.isEnabled ? "Disable via Platform" : "Enable via Platform",
        },
        idempotencyKey: createIdempotencyKey(),
      });
      replaceFlag(updated);
    } catch (cause) {
      setError(toMessage(cause));
    }
  }

  return {
    environment,
    setEnvironment,
    rows,
    cursor,
    isLoading,
    isAppending,
    error,
    loadMore,
    refresh: () => loadFirstPage(environment),
    replaceFlag,
    toggle,
  };
}
