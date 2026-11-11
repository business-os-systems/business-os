"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CATALOG_ITEM_KINDS,
  fetchCatalogItemPage,
  type CatalogItem,
} from "@/lib/catalog-api";
import { toMessage } from "@/lib/error-message";
import { useRequestTicket } from "@/lib/use-request-ticket";

/**
 * The whole catalog as one read for the record's summary destinations. Rollout
 * and activity need every kind at once, so the three cursor lists are loaded in
 * parallel with the API's hard cap; neither screen invents a second endpoint.
 */
export const CATALOG_SNAPSHOT_LIMIT = 100;

async function fetchCatalogSnapshot(appId: string): Promise<readonly CatalogItem[]> {
  const pages = await Promise.all(
    CATALOG_ITEM_KINDS.map((kind) =>
      fetchCatalogItemPage({ appId, kind, limit: CATALOG_SNAPSHOT_LIMIT }),
    ),
  );
  return pages.flatMap((page) => page.items);
}

interface CatalogSnapshotInput {
  readonly appId: string;
  readonly enabled: boolean;
}

export function useCatalogSnapshot(input: CatalogSnapshotInput) {
  const [items, setItems] = useState<readonly CatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestTicket = useRequestTicket();
  const { appId, enabled } = input;

  const reload = useCallback(async () => {
    const current = requestTicket.begin();
    setIsLoading(true);
    setError(null);
    try {
      const next = await fetchCatalogSnapshot(appId);
      if (requestTicket.isCurrent(current)) {
        setItems(next);
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
  }, [appId, requestTicket]);

  useEffect(() => {
    if (enabled) {
      void reload();
    }
  }, [enabled, reload]);

  return { items, isLoading, error };
}
