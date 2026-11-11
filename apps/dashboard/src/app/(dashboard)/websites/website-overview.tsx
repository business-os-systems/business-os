"use client";

import React, { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, ConfigTableRenderer, Spinner } from "@suite/ui";
import { PlusIcon } from "@suite/ui/icons";
import { WEBSITE_BUILDER_CREATE_SITE_HREF } from "@/components/layout/website-builder-nav.config";
import { createWebsiteTableConfig } from "./websites.config";
import { useWebsiteSites, type WebsiteOverviewState } from "./use-websites";

function OverviewHeader({ onCreate }: { readonly onCreate: () => void }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Websites</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Create a site, edit it in the studio, and publish when it is ready.
        </p>
      </div>
      <Button size="sm" startIcon={<PlusIcon className="h-4 w-4" />} onClick={onCreate}>
        Create website
      </Button>
    </div>
  );
}

function OverviewBody({
  state,
  config,
  onRetry,
  onLoadMore,
  isLoadingMore,
}: {
  readonly state: WebsiteOverviewState;
  readonly config: ReturnType<typeof createWebsiteTableConfig>;
  readonly onRetry: () => void;
  readonly onLoadMore: () => void;
  readonly isLoadingMore: boolean;
}) {
  if (state.kind === "loading") {
    return (
      <div
        role="status"
        aria-label="Loading websites"
        className="flex h-48 items-center justify-center rounded-xl border border-border bg-surface"
      >
        <Spinner size="md" className="text-action" />
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="space-y-3">
        <Alert variant="error" title="Could not load websites" message={state.message} />
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ConfigTableRenderer
        config={config}
        data={state.sites}
        rowKey={(site) => site.id}
        className="rounded-xl"
      />
      {state.nextCursor === null ? null : (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            isLoading={isLoadingMore}
            onClick={onLoadMore}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

export function WebsiteOverview() {
  const router = useRouter();
  const { state, isLoadingMore, reload, loadMore } = useWebsiteSites();
  const onCreate = useCallback(() => {
    router.push(WEBSITE_BUILDER_CREATE_SITE_HREF);
  }, [router]);
  const config = createWebsiteTableConfig({ onCreate });

  return (
    <div className="space-y-6">
      <OverviewHeader onCreate={onCreate} />
      <OverviewBody
        state={state}
        config={config}
        onRetry={() => void reload()}
        onLoadMore={() => void loadMore()}
        isLoadingMore={isLoadingMore}
      />
    </div>
  );
}
