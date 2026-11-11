"use client";

import React from "react";
import { MediaTableToolbar } from "./media-table-toolbar";
import type { MediaFilterControls } from "../hooks/use-media-filter";

export interface MediaLibraryFiltersProps {
  readonly controls: MediaFilterControls;
  readonly canUpload: boolean;
  readonly onUpload: () => void;
}

export function MediaLibraryFilters({
  controls,
  canUpload,
  onUpload,
}: MediaLibraryFiltersProps) {
  const { filter, searchDraft, setSearchDraft, submitSearch } = controls;
  return (
    <MediaTableToolbar
      searchDraft={searchDraft}
      onSearchDraftChange={setSearchDraft}
      onSearchSubmit={submitSearch}
      typeFilter={filter.type}
      onTypeFilterChange={controls.setTypeFilter}
      unusedOnly={filter.unusedOnly}
      onUnusedOnlyChange={controls.setUnusedOnly}
      canUpload={canUpload}
      onUpload={onUpload}
    />
  );
}
