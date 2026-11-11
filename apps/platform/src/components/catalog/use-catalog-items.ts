"use client";

import { useCallback, useState } from "react";
import {
  CATALOG_ITEM_STATUSES,
  fetchCatalogItemPage,
  type CatalogItem,
  type CatalogItemKind,
  type CatalogItemStatus,
} from "@/lib/catalog-api";
import { useCursorPage } from "@/lib/use-cursor-page";

export const CATALOG_STATUS_ALL = "all" as const;
export type CatalogStatusFilter = typeof CATALOG_STATUS_ALL | CatalogItemStatus;

export function isCatalogStatusFilter(value: string): value is CatalogStatusFilter {
  return value === CATALOG_STATUS_ALL || CATALOG_ITEM_STATUSES.some((status) => status === value);
}

interface CatalogItemsInput {
  readonly appId: string;
  readonly kind: CatalogItemKind;
  readonly enabled: boolean;
}

/**
 * Catalog list state on top of the shared cursor machine. A status change
 * creates a new loader, which resets the page; a saved item replaces its row.
 */
export function useCatalogItems(input: CatalogItemsInput) {
  const [status, setStatus] = useState<CatalogStatusFilter>(CATALOG_STATUS_ALL);
  const loadPage = useCallback(
    (cursor?: string) =>
      fetchCatalogItemPage({
        appId: input.appId,
        kind: input.kind,
        ...(status === CATALOG_STATUS_ALL ? {} : { status }),
        ...(cursor === undefined ? {} : { cursor }),
      }),
    [input.appId, input.kind, status],
  );
  const page = useCursorPage<CatalogItem>(loadPage, input.enabled);

  function upsertItem(item: CatalogItem): void {
    page.setItems((existing) => {
      if (existing.some((row) => row.id === item.id)) {
        return existing.map((row) => (row.id === item.id ? item : row));
      }
      if (status !== CATALOG_STATUS_ALL && item.status !== status) {
        return existing;
      }
      return [item, ...existing];
    });
  }

  return {
    status,
    setStatus,
    items: page.items,
    cursor: page.cursor,
    isLoading: page.isLoading,
    isAppending: page.isAppending,
    error: page.error,
    loadMore: page.loadMore,
    refresh: page.reload,
    upsertItem,
  };
}
