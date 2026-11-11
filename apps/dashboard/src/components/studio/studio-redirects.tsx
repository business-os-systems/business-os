"use client";

import React, { useEffect, useState } from "react";
import { Button, ConfigTableRenderer } from "@suite/ui";
import {
  describeCmsError,
  getSite,
  listSiteRedirects,
  type CmsRedirectDto,
  type CmsSiteDto,
} from "@/lib/api/site-client";
import { createRedirectTableConfig } from "./studio-redirects.config";

export interface StudioRedirectsProps {
  readonly siteId: string;
}

type RedirectsState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "ready";
      readonly site: CmsSiteDto;
      readonly redirects: readonly CmsRedirectDto[];
    };

/** Redirects destination for one site; redirects are created by page moves. */
export function StudioRedirects({ siteId }: StudioRedirectsProps) {
  const [state, setState] = useState<RedirectsState>({ kind: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    Promise.all([getSite(siteId), listSiteRedirects(siteId)])
      .then(([site, page]) => {
        if (!cancelled) {
          setState({ kind: "ready", site, redirects: page.items });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ kind: "error", message: describeCmsError(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, refreshKey]);

  if (state.kind === "loading") {
    return <p className="text-xs font-medium text-text-muted">Loading redirects...</p>;
  }
  if (state.kind === "error") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="max-w-xl text-sm font-medium text-danger">{state.message}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRefreshKey((key) => key + 1)}
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <section aria-label="Site redirects" className="max-w-4xl space-y-3">
      <p className="text-xs text-text-secondary">
        {state.site.title} keeps old addresses alive when a published page moves.
      </p>
      <ConfigTableRenderer
        config={createRedirectTableConfig()}
        data={[...state.redirects]}
        rowKey={(redirect) => redirect.id}
        className="rounded-xl"
      />
    </section>
  );
}
