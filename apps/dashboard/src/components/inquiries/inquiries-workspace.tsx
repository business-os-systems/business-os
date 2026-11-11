"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Alert, Button, ConfigTableRenderer, Spinner } from "@suite/ui";
import type { WebsiteSiteSummary } from "@/app/(dashboard)/websites/websites.contract";
import { useWebsiteSites } from "@/app/(dashboard)/websites/use-websites";
import {
  createInquiryFilters,
  createInquiryTableConfig,
  INQUIRY_FILTERED_EMPTY_STATE,
} from "./inquiries.config";
import { InquiryFilterBar } from "./inquiry-filters";
import { InquiryDetailDrawer } from "./inquiry-detail";
import type { InquiryStatus, InquirySummary } from "./inquiries.contract";
import { useInquiryList, type InquiryListState } from "./use-inquiry-list";

const NO_SITES: readonly WebsiteSiteSummary[] = [];

function toInquiryStatus(value: string | null): InquiryStatus | null {
  if (value === "NEW" || value === "READ" || value === "ARCHIVED" || value === "SPAM") {
    return value;
  }
  return null;
}

function resolveSites(state: ReturnType<typeof useWebsiteSites>["state"]): readonly WebsiteSiteSummary[] {
  return state.kind === "ready" ? state.sites : NO_SITES;
}

function resolveActiveSite(
  sites: readonly WebsiteSiteSummary[],
  selected: InquirySummary | null
): WebsiteSiteSummary | null {
  if (selected === null) {
    return null;
  }
  return sites.find((site) => site.id === selected.siteId) ?? null;
}

function resolveEmptyState(activeFilterCount: number): typeof INQUIRY_FILTERED_EMPTY_STATE | undefined {
  return activeFilterCount === 0 ? undefined : INQUIRY_FILTERED_EMPTY_STATE;
}

function InquiryListBody({
  state,
  tableConfig,
  emptyState,
  onRetry,
}: {
  readonly state: InquiryListState;
  readonly tableConfig: ReturnType<typeof createInquiryTableConfig>;
  readonly emptyState: typeof INQUIRY_FILTERED_EMPTY_STATE | undefined;
  readonly onRetry: () => void;
}) {
  if (state.kind === "loading") {
    return (
      <div role="status" aria-label="Loading inquiries" className="flex h-48 items-center justify-center rounded-xl border border-border bg-surface">
        <Spinner size="md" className="text-action" />
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="space-y-3">
        <Alert variant="error" title="Could not load inquiries" message={state.message} />
        <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>
      </div>
    );
  }
  return (
    <ConfigTableRenderer
      config={tableConfig}
      data={state.items}
      rowKey={(inquiry) => inquiry.id}
      className="rounded-xl"
      {...(emptyState === undefined ? {} : { emptyState })}
    />
  );
}

export function InquiriesWorkspace({ canRevealPii }: { readonly canRevealPii: boolean }) {
  const sitesController = useWebsiteSites();
  const siteState = sitesController.state;
  const sites = useMemo(() => resolveSites(siteState), [siteState]);
  const list = useInquiryList();
  const [selected, setSelected] = useState<InquirySummary | null>(null);
  const filters = createInquiryFilters(sites);
  const tableConfig = useMemo(
    () => createInquiryTableConfig({ sites, onOpen: setSelected }),
    [sites]
  );
  const activeSite = resolveActiveSite(sites, selected);

  const onFilterChange = useCallback(
    (id: "status" | "siteId", value: string | null) => {
      if (id === "status") {
        list.setStatusFilter(toInquiryStatus(value));
        return;
      }
      list.setSiteFilter(value);
    },
    [list]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Inquiries</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Every enquiry captured by this workspace&apos;s websites. Contact details stay hidden until revealed.
        </p>
      </div>
      <InquiryFilterBar filters={filters} values={list.filters} onChange={onFilterChange} />
      <InquiryListBody
        state={list.state}
        tableConfig={tableConfig}
        emptyState={resolveEmptyState(list.activeFilterCount)}
        onRetry={() => void list.reload()}
      />
      <LoadMoreRow state={list.state} isLoadingMore={list.isLoadingMore} onLoadMore={() => void list.loadMore()} />
      <InquiryDetailDrawer
        inquiryId={selected?.id ?? null}
        canRevealPii={canRevealPii}
        siteName={activeSite?.title ?? "Website"}
        siteTimeZone={activeSite?.timezone ?? "UTC"}
        onClose={() => setSelected(null)}
        onChanged={() => void list.reload()}
      />
    </div>
  );
}

function LoadMoreRow({
  state,
  isLoadingMore,
  onLoadMore,
}: {
  readonly state: InquiryListState;
  readonly isLoadingMore: boolean;
  readonly onLoadMore: () => void;
}) {
  if (state.kind !== "ready" || state.nextCursor === null) {
    return null;
  }
  return (
    <div className="flex justify-center">
      <Button variant="secondary" size="sm" isLoading={isLoadingMore} onClick={onLoadMore}>
        Load more
      </Button>
    </div>
  );
}
