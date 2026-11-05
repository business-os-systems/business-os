"use client";

import { useCallback, useEffect, useState } from "react";
import { useRequestTicket } from "@/lib/use-request-ticket";
import { useRouter } from "next/navigation";
import { Button } from "@suite/ui";
import {
  ConfigTable,
  type ConfigTableState,
} from "@/components/tables/config-table";
import {
  TENANT_FILTERED_EMPTY_STATE,
  TENANT_TABLE_CONFIG,
} from "@/components/tables/tenant-table.config";
import { toMessage } from "@/lib/error-message";
import { fetchTenantPage, type TenantSummary } from "@/lib/tenant-api";
import {
  STATUS_ALL,
  TenantListToolbar,
  type StatusFilter,
} from "./tenant-list-toolbar";

const PAGE_SIZE = 25;

export default function TenantsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>(STATUS_ALL);
  const [rows, setRows] = useState<readonly TenantSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAppending, setIsAppending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every fetch takes a ticket; only the newest answer is allowed to render.
  const requestTicket = useRequestTicket();

  const loadFirstPage = useCallback(
    async (nextSearch: string, nextFilter: StatusFilter) => {
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
      void loadFirstPage(search, filter);
    }, 300);
    return () => {
      clearTimeout(handle);
    };
  }, [search, filter, loadFirstPage]);

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

  const isFiltered = search.trim() !== "" || filter.kind === "status";

  const state: ConfigTableState =
    isLoading && rows.length === 0
      ? { kind: "loading" }
      : error !== null && rows.length === 0
        ? { kind: "error", title: "Unable to load tenants", message: error }
        : { kind: "ready" };

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Tenants</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Every organization on the platform. Personal data is not shown here;
          open a tenant to request it with a recorded reason.
        </p>
      </div>

      <TenantListToolbar
        search={search}
        filter={filter}
        total={total}
        isBusy={isLoading}
        onSearchChange={setSearch}
        onFilterChange={setFilter}
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

      {cursor !== null ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            disabled={isAppending}
            onClick={() => void loadMore()}
          >
            {isAppending ? "Loading..." : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
