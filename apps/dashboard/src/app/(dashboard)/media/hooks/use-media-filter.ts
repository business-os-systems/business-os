"use client";

import { useState } from "react";
import {
  EMPTY_MEDIA_FILTER,
  type MediaFilterState,
  type MediaTypeFilter,
} from "@suite/media/react";

export interface MediaFilterControls {
  readonly filter: MediaFilterState;
  readonly searchDraft: string;
  readonly setSearchDraft: (value: string) => void;
  readonly submitSearch: () => void;
  readonly setTypeFilter: (value: MediaTypeFilter) => void;
  readonly setUnusedOnly: (value: boolean) => void;
}

export function useMediaFilter(): MediaFilterControls {
  const [filter, setFilter] = useState<MediaFilterState>(EMPTY_MEDIA_FILTER);
  const [searchDraft, setSearchDraft] = useState("");
  return {
    filter,
    searchDraft,
    setSearchDraft,
    submitSearch: () =>
      setFilter((previous) => ({ ...previous, search: searchDraft })),
    setTypeFilter: (value) =>
      setFilter((previous) => ({ ...previous, type: value })),
    setUnusedOnly: (value) =>
      setFilter((previous) => ({ ...previous, unusedOnly: value })),
  };
}
