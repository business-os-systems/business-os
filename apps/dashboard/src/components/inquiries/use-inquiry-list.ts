"use client";

import { useCallback, useEffect, useState } from "react";
import { readProblemMessage } from "@/lib/problem-details";
import {
  inquiryListPageSchema,
  type InquiryStatus,
  type InquirySummary,
} from "./inquiries.contract";

const PAGE_SIZE = 20;

export interface InquiryFilters {
  readonly status: InquiryStatus | null;
  readonly siteId: string | null;
}

export type InquiryListState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "ready";
      readonly items: readonly InquirySummary[];
      readonly nextCursor: string | null;
    };

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function listUrl(filters: InquiryFilters, cursor?: string): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (filters.status !== null) {
    params.set("status", filters.status);
  }
  if (filters.siteId !== null) {
    params.set("siteId", filters.siteId);
  }
  if (cursor !== undefined) {
    params.set("cursor", cursor);
  }
  return "/api/cms/inquiries?" + params.toString();
}

async function fetchInquiryPage(
  filters: InquiryFilters,
  cursor?: string
): Promise<{ items: readonly InquirySummary[]; nextCursor: string | null }> {
  const response = await fetch(listUrl(filters, cursor), {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      readProblemMessage(body) ?? "The inquiries request failed with status " + response.status + "."
    );
  }
  const parsed = inquiryListPageSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("The inquiries response did not match the expected contract.");
  }
  return parsed.data;
}

function useInquiryFilters() {
  const [filters, setFilters] = useState<InquiryFilters>({ status: null, siteId: null });
  const setStatusFilter = useCallback((status: InquiryStatus | null) => {
    setFilters((current) => ({ ...current, status }));
  }, []);
  const setSiteFilter = useCallback((siteId: string | null) => {
    setFilters((current) => ({ ...current, siteId }));
  }, []);
  const activeFilterCount =
    (filters.status === null ? 0 : 1) + (filters.siteId === null ? 0 : 1);
  return { filters, setStatusFilter, setSiteFilter, activeFilterCount };
}

export interface InquiryListController {
  readonly state: InquiryListState;
  readonly isLoadingMore: boolean;
  readonly filters: InquiryFilters;
  readonly activeFilterCount: number;
  readonly setStatusFilter: (status: InquiryStatus | null) => void;
  readonly setSiteFilter: (siteId: string | null) => void;
  readonly reload: () => Promise<void>;
  readonly loadMore: () => Promise<void>;
}

export function useInquiryList(): InquiryListController {
  const filterState = useInquiryFilters();
  const { filters } = filterState;
  const [state, setState] = useState<InquiryListState>({ kind: "loading" });
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadFirstPage = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const page = await fetchInquiryPage(filters);
      setState({ kind: "ready", items: page.items, nextCursor: page.nextCursor });
    } catch (error: unknown) {
      setState({ kind: "error", message: toMessage(error) });
    }
  }, [filters]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (state.kind !== "ready" || state.nextCursor === null) {
      return;
    }
    setIsLoadingMore(true);
    try {
      const page = await fetchInquiryPage(filters, state.nextCursor);
      setState({ kind: "ready", items: [...state.items, ...page.items], nextCursor: page.nextCursor });
    } catch (error: unknown) {
      setState({ kind: "error", message: toMessage(error) });
    } finally {
      setIsLoadingMore(false);
    }
  }, [filters, state]);

  return { state, isLoadingMore, ...filterState, reload: loadFirstPage, loadMore };
}
