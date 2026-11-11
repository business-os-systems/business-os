import { MEDIA_ASSET_KINDS } from "../constants.js";
import type { MediaListQuery } from "./media-client.js";

type MediaAssetKind = (typeof MEDIA_ASSET_KINDS)[number];

/** The "no type restriction" filter value, shared by every picker toolbar. */
export const MEDIA_TYPE_FILTER_ALL = "ALL";

export type MediaTypeFilter = MediaAssetKind | typeof MEDIA_TYPE_FILTER_ALL;

export interface MediaFilterState {
  readonly search: string;
  readonly type: MediaTypeFilter;
  readonly unusedOnly: boolean;
}

export const EMPTY_MEDIA_FILTER: MediaFilterState = {
  search: "",
  type: MEDIA_TYPE_FILTER_ALL,
  unusedOnly: false,
};

const MEDIA_KIND_LABELS: Record<MediaAssetKind, string> = {
  IMAGE: "Images",
};

export interface MediaTypeFilterOption {
  readonly value: MediaTypeFilter;
  readonly label: string;
}

export const MEDIA_TYPE_FILTER_OPTIONS: readonly MediaTypeFilterOption[] = [
  { value: MEDIA_TYPE_FILTER_ALL, label: "All types" },
  ...MEDIA_ASSET_KINDS.map((kind) => ({
    value: kind,
    label: MEDIA_KIND_LABELS[kind],
  })),
];

export function toMediaTypeFilter(value: string): MediaTypeFilter {
  if (value === MEDIA_TYPE_FILTER_ALL) {
    return MEDIA_TYPE_FILTER_ALL;
  }
  const kind = MEDIA_ASSET_KINDS.find((candidate) => candidate === value);
  return kind ?? MEDIA_TYPE_FILTER_ALL;
}

/**
 * Canonical query builder shared by the library and the picker. An empty
 * search, the All filter and the unused toggle are omitted instead of sent as
 * nulls, so the API receives exactly what the operator asked for.
 */
export function buildMediaListQuery(
  filter: MediaFilterState,
  limit: number
): MediaListQuery {
  const search = filter.search.trim();
  const type = filter.type === MEDIA_TYPE_FILTER_ALL ? null : filter.type;
  const unused = filter.unusedOnly ? true : null;
  return {
    limit,
    ...(search.length === 0 ? {} : { search }),
    ...(type === null ? {} : { type }),
    ...(unused === null ? {} : { unused }),
  };
}
