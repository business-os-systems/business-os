"use client";

import { useCallback, useEffect, useState } from "react";
import { useRequestTicket } from "@/lib/use-request-ticket";
import { useRouter } from "next/navigation";
import { Button } from "@suite/ui";
import { ConfigTable, type ConfigTableState } from "@/components/tables/config-table";
import {
  TENANT_FILTERED_EMPTY_STATE,
  TENANT_TABLE_CONFIG,
} from "@/components/tables/tenant-table.config";
import { toMessage } from "@/lib/error-message";
import { formatDateTime } from "@/lib/format";
import { fetchTenantPage, type TenantSummary } from "@/lib/tenant-api";
import { STATUS_ALL, TenantListToolbar, type StatusFilter } from "./tenant-list-toolbar";

const PAGE_SIZE = 25;

export function resolveFleetState(
  isLoading: boolean,
  error: string | null,
  rowCount: number,
): ConfigTableState {
  if (isLoading && rowCount === 0) return { kind: "loading" };
  if (error !== null && rowCount === 0) {
    return { kind: "error", title: "Unable to load tenants", message: error };
  }
  return { kind: "ready" };
}

export default function TenantsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>(STATUS_ALL);
  const [appFilter, setAppFilter] = useState("");
  const [rows, setRows] = useState<readonly TenantSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAppending, setIsAppending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every fetch takes a ticket; only the newest answer is allowed to render.
  const requestTicket = useRequestTicket();

  const loadFirstPage = useCallback(
    async (
      nextSearch: string,
      nextFilter: StatusFilter,
      nextAppFilter: string,
    ) => {
      const current = requestTicket.begin();

      setIsLoading(true);
      setError(null);
      setRows([]);
      setCursor(null);
      setTotal(null);

      try {
        const page = await fetchTenantPage({
          q: nextSearch.trim() === "" ? undefined : nextSearch.trim(),
          status: nextFilter.kind === "status" ? nextFilter.status : undefined,
          appId: nextAppFilter === "" ? undefined : nextAppFilter,
          limit: PAGE_SIZE,
        });
        if (!requestTicket.isCurrent(current)) {
          return;
        }
        setRows(page.items);
        setCursor(page.nextCursor);
        setTotal(page.total);
      } catch (cause) {
        if (!requestTicket.isCurrent(current)) {
          return;
        }
        setRows([]);
        setCursor(null);
        setTotal(null);
        setError(toMessage(cause));
      } finally {
        if (requestTicket.isCurrent(current)) {
          setIsLoading(false);
        }
      }
    },
    [requestTicket],
  );

  useEffect(() => {
    // Debounce so typing does not issue one request per keystroke.
    const handle = setTimeout(() => {
      void loadFirstPage(search, filter, appFilter);
    }, 300);
    return () => {
      clearTimeout(handle);
    };
  }, [search, filter, appFilter, loadFirstPage]);

  async function loadMore(): Promise<void> {
    if (cursor === null) {
      return;
    }
    const current = requestTicket.current();
    setIsAppending(true);
    setError(null);
    try {
      const page = await fetchTenantPage({
        q: search.trim() === "" ? undefined : search.trim(),
        status: filter.kind === "status" ? filter.status : undefined,
        appId: appFilter === "" ? undefined : appFilter,
        cursor,
        limit: PAGE_SIZE,
      });
      if (!requestTicket.isCurrent(current)) {
        return;
      }
      setRows((existing) => [...existing, ...page.items]);
      setCursor(page.nextCursor);
      setTotal(page.total);
    } catch (cause) {
      if (requestTicket.isCurrent(current)) {
        setError(toMessage(cause));
      }
    } finally {
      setIsAppending(false);
    }
  }

  const isFiltered =
    search.trim() !== "" || filter.kind === "status" || appFilter !== "";

  const state = resolveFleetState(isLoading, error, rows.length);

  return (
    <div className="max-w-full space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Tenants</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Every organization on the platform. Personal data is not shown here; open a tenant to
          request it with a recorded reason.
        </p>
      </div>

      <TenantListToolbar
        search={search}
        filter={filter}
        appFilter={appFilter}
        total={total}
        isBusy={isLoading}
        onSearchChange={setSearch}
        onFilterChange={setFilter}
        onAppFilterChange={setAppFilter}
      />

      <ConfigTable
        config={TENANT_TABLE_CONFIG}
        rows={rows}
        state={state}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.name}
        emptyState={isFiltered ? TENANT_FILTERED_EMPTY_STATE : undefined}
        onRowClick={(row) => {
          router.push(`/tenants/${encodeURIComponent(row.id)}`);
        }}
      />

      {rows.length === 0 ? null : (
        <p className="text-xs text-text-muted">
          Counts as of {formatDateTime(rows[0]?.asOf ?? "")}.
        </p>
      )}

      {cursor !== null ? (
        <div className="flex justify-center">
          <Button variant="secondary" disabled={isAppending} onClick={() => void loadMore()}>
            {isAppending ? "Loading..." : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
