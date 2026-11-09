"use client";

import { useCallback, useState } from "react";
import {
  EMPTY_AUDIT_FILTER_DRAFT,
  toAuditFilters,
  type AuditFilterDraft,
  type AuditFilterName,
} from "@/components/audit/audit-filter.config";
import {
  AUDIT_PAGE_SIZE,
  fetchAuditPage,
  type AuditFilters,
} from "@/lib/audit-api";
import { useCursorPage } from "@/lib/use-cursor-page";

/**
 * Audit search state: the applied filters own the cursor-paged list, while the
 * draft keeps typing local until the operator applies it. The shared cursor hook
 * discards a slow answer from superseded filters.
 */
export function useAudit() {
  const [draft, setDraft] = useState<AuditFilterDraft>(EMPTY_AUDIT_FILTER_DRAFT);
  const [filters, setFilters] = useState<AuditFilters>({});
  const loadPage = useCallback(
    (cursor?: string) =>
      fetchAuditPage({ ...filters, cursor, limit: AUDIT_PAGE_SIZE }),
    [filters],
  );
  const page = useCursorPage(loadPage);

  function updateDraft(name: AuditFilterName, value: string): void {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function applyFilters(): void {
    setFilters(toAuditFilters(draft));
  }

  function clearFilters(): void {
    setDraft(EMPTY_AUDIT_FILTER_DRAFT);
    setFilters({});
  }

  return {
    draft,
    filters,
    rows: page.items,
    cursor: page.cursor,
    isLoading: page.isLoading,
    isAppending: page.isAppending,
    error: page.error,
    hasFilters: Object.keys(filters).length > 0,
    updateDraft,
    applyFilters,
    clearFilters,
    loadMore: page.loadMore,
    refresh: page.reload,
  };
}
