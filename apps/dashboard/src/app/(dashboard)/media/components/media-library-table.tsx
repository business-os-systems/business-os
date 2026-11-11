"use client";

import React from "react";
import { Button, Card, ConfigTableRenderer } from "@suite/ui";
import { MEDIA_TYPE_FILTER_ALL } from "@suite/media/react";
import {
  MEDIA_EMPTY_FILTERED_STATE,
  createMediaTableConfig,
} from "../media.config";
import type { MediaLibraryState } from "../hooks/use-media-library";
import { MediaLibraryFilters } from "./media-library-filters";

export interface MediaLibraryTableProps {
  readonly state: MediaLibraryState;
  readonly userPermissions: readonly string[];
}

export function MediaLibraryTable({
  state,
  userPermissions,
}: MediaLibraryTableProps) {
  const { filter } = state.controls;
  const hasActiveFilter =
    filter.search.trim().length > 0 ||
    filter.type !== MEDIA_TYPE_FILTER_ALL ||
    filter.unusedOnly;
  const tableConfig = createMediaTableConfig({
    canUpload: state.canUpload,
    onInspect: (asset) => state.openDetail(asset.id),
    onDelete: (asset) => void state.deleteAsset(asset),
    onUpload: state.openUpload,
  });
  const emptyStateProps = hasActiveFilter
    ? { emptyState: MEDIA_EMPTY_FILTERED_STATE }
    : {};
  const isInitialLoading =
    state.assets.isLoading && state.assets.assets.length === 0;

  return (
    <Card className="p-0">
      <ConfigTableRenderer
        config={tableConfig}
        data={state.assets.assets}
        userPermissions={userPermissions}
        isLoading={isInitialLoading}
        error={state.assets.error === null ? null : state.assets.error.message}
        errorTitle="Could not load the media library"
        {...emptyStateProps}
        toolbar={
          <MediaLibraryFilters
            controls={state.controls}
            canUpload={state.canUpload}
            onUpload={state.openUpload}
          />
        }
        footer={<MediaLibraryLoadMore assets={state.assets} />}
      />
    </Card>
  );
}

function MediaLibraryLoadMore({
  assets,
}: {
  readonly assets: MediaLibraryState["assets"];
}) {
  if (!assets.hasMore) {
    return null;
  }
  return (
    <div className="border-t border-border p-3">
      <Button
        type="button"
        variant="outline"
        isLoading={assets.isLoading}
        onClick={() => void assets.loadMore()}
      >
        Load more assets
      </Button>
    </div>
  );
}
