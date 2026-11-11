"use client";

import { useCallback, useEffect, useState } from "react";
import { readProblemMessage } from "@/lib/problem-details";
import {
  inquiryListPageSchema,
  type InquirySummary,
} from "@/components/inquiries/inquiries.contract";

const SITE_INQUIRY_LIMIT = 20;

export type SiteInquiryState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "ready";
      readonly items: readonly InquirySummary[];
      readonly nextCursor: string | null;
    };

async function fetchSiteInquiries(siteId: string): Promise<{
  items: readonly InquirySummary[];
  nextCursor: string | null;
}> {
  const params = new URLSearchParams({
    siteId,
    limit: String(SITE_INQUIRY_LIMIT),
  });
  const response = await fetch("/api/cms/inquiries?" + params.toString(), {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      readProblemMessage(body) ??
        "The inquiries request failed with status " + String(response.status) + "."
    );
  }
  const parsed = inquiryListPageSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("The inquiries response did not match the expected contract.");
  }
  return parsed.data;
}

/** Loads one site's inquiries for the studio destination (FR-082, FR-127). */
export function useSiteInquiries(siteId: string): {
  readonly state: SiteInquiryState;
  readonly reload: () => void;
} {
  const [state, setState] = useState<SiteInquiryState>({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetchSiteInquiries(siteId)
      .then((page) => {
        if (!cancelled) {
          setState({ kind: "ready", items: page.items, nextCursor: page.nextCursor });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, refreshKey]);

  const reload = useCallback(() => setRefreshKey((key) => key + 1), []);
  return { state, reload };
}
