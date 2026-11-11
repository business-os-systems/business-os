"use client";

import { useCallback, useEffect, useState } from "react";
import { readProblemMessage } from "@/lib/problem-details";
import {
  websiteSitesPageSchema,
  type WebsiteSiteSummary,
  type WebsiteSitesPage,
} from "./websites.contract";

const PAGE_SIZE = 25;

export type WebsiteOverviewState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "ready";
      readonly sites: readonly WebsiteSiteSummary[];
      readonly nextCursor: string | null;
    };

export interface WebsiteSitesController {
  readonly state: WebsiteOverviewState;
  readonly isLoadingMore: boolean;
  readonly reload: () => Promise<void>;
  readonly loadMore: () => Promise<void>;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sitesUrl(cursor?: string): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor !== undefined) {
    params.set("cursor", cursor);
  }
  return `/api/cms/sites?${params.toString()}`;
}

async function fetchSitesPage(cursor?: string): Promise<WebsiteSitesPage> {
  const response = await fetch(sitesUrl(cursor), {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      readProblemMessage(body) ??
        `The websites request failed with status ${response.status}.`
    );
  }
  const parsed = websiteSitesPageSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("The websites response did not match the expected contract.");
  }
  return parsed.data;
}

export function useWebsiteSites(): WebsiteSitesController {
  const [state, setState] = useState<WebsiteOverviewState>({ kind: "loading" });
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const page = await fetchSitesPage();
      setState({ kind: "ready", sites: page.sites, nextCursor: page.nextCursor });
    } catch (error) {
      setState({ kind: "error", message: toMessage(error) });
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    fetchSitesPage()
      .then((page) => {
        if (isActive) {
          setState({ kind: "ready", sites: page.sites, nextCursor: page.nextCursor });
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setState({ kind: "error", message: toMessage(error) });
        }
      });
    return () => {
      isActive = false;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (state.kind !== "ready" || state.nextCursor === null) {
      return;
    }
    setIsLoadingMore(true);
    try {
      const page = await fetchSitesPage(state.nextCursor);
      setState({
        kind: "ready",
        sites: [...state.sites, ...page.sites],
        nextCursor: page.nextCursor,
      });
    } catch (error) {
      setState({ kind: "error", message: toMessage(error) });
    } finally {
      setIsLoadingMore(false);
    }
  }, [state]);

  return { state, isLoadingMore, reload, loadMore };
}
