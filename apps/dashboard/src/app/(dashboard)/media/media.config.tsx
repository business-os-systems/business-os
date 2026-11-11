import React from "react";
import {
  EyeIcon,
  TrashIcon,
  type TableActionConfig,
  type TableColumnConfig,
  type TableConfig,
  type TableEmptyStateConfig,
} from "@suite/ui";
import { PERMISSIONS } from "@suite/core";
import {
  formatMediaFileSize,
  formatMediaTimestamp,
  type MediaAssetView,
} from "@suite/media/react";

export interface CreateMediaTableConfigOptions {
  readonly canUpload: boolean;
  readonly onInspect: (asset: MediaAssetView) => void;
  readonly onDelete: (asset: MediaAssetView) => void;
  readonly onUpload: () => void;
}

export const MEDIA_EMPTY_FILTERED_STATE: TableEmptyStateConfig = {
  title: "No assets match these filters",
  description: "Change the search text, type or unused filter to see more.",
};

function buildEmptyState(
  canUpload: boolean,
  onUpload: () => void
): TableEmptyStateConfig {
  const base: TableEmptyStateConfig = {
    title: "No media assets yet",
    description:
      "Upload an image once; every application in this workspace can reuse it.",
  };
  if (!canUpload) {
    return base;
  }
  return { ...base, actionLabel: "Upload image", onAction: onUpload };
}

function renderAssetName(asset: MediaAssetView): React.ReactNode {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src={asset.url}
        alt={asset.fileName}
        loading="lazy"
        className="h-9 w-12 shrink-0 rounded-md border border-border bg-surface-muted object-cover"
      />
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-text" title={asset.fileName}>
          {asset.fileName}
        </p>
        <p className="text-[11px] text-text-muted">{asset.mimeType}</p>
      </div>
    </div>
  );
}

function renderUsageCount(value: unknown): React.ReactNode {
  if (value === 0) {
    return <span className="text-xs font-semibold text-success">Unused</span>;
  }
  if (typeof value === "number") {
    return (
      <span className="text-xs font-semibold text-text-secondary">
        {value} location{value === 1 ? "" : "s"}
      </span>
    );
  }
  return <span className="text-xs font-semibold text-text-secondary">—</span>;
}

function nameColumn(): TableColumnConfig<MediaAssetView> {
  return {
    key: "fileName",
    header: "Asset",
    sortable: true,
    render: (_value, asset) => renderAssetName(asset),
  };
}

function usageColumn(): TableColumnConfig<MediaAssetView> {
  return {
    key: "usageCount",
    header: "Usage",
    sortable: true,
    render: (value) => renderUsageCount(value),
  };
}

function sizeColumn(): TableColumnConfig<MediaAssetView> {
  return {
    key: "sizeBytes",
    header: "Size",
    sortable: true,
    render: (value) => (
      <span className="text-xs text-text-secondary">
        {typeof value === "number" ? formatMediaFileSize(value) : "—"}
      </span>
    ),
  };
}

function createdColumn(): TableColumnConfig<MediaAssetView> {
  return {
    key: "createdAt",
    header: "Uploaded",
    sortable: true,
    render: (value) => (
      <span className="text-xs text-text-muted">
        {typeof value === "string" ? formatMediaTimestamp(value) : "—"}
      </span>
    ),
  };
}

function buildActions({
  onInspect,
  onDelete,
}: Pick<CreateMediaTableConfigOptions, "onInspect" | "onDelete">): TableActionConfig<MediaAssetView>[] {
  return [
    {
      id: "inspect-media",
      label: "Inspect asset",
      tooltip: "View usage locations and asset details",
      variant: "outline",
      permission: PERMISSIONS.MEDIA.READ,
      renderIcon: () => <EyeIcon className="h-3.5 w-3.5 text-text" />,
      onClick: onInspect,
    },
    {
      id: "delete-media",
      label: "Delete asset",
      tooltip: "Delete an asset that published content no longer references",
      variant: "destructive",
      permission: PERMISSIONS.MEDIA.DELETE,
      renderIcon: () => <TrashIcon className="h-3.5 w-3.5 text-text-inverse" />,
      verification: {
        kind: "confirm",
        title: "Delete this asset?",
        message:
          "Deletion is refused while published content references the asset; the refusal lists every location.",
      },
      onClick: onDelete,
    },
  ];
}

export function createMediaTableConfig(
  options: CreateMediaTableConfigOptions
): TableConfig<MediaAssetView> {
  return {
    id: "workspace-media-library-table",
    columns: [
      nameColumn(),
      usageColumn(),
      sizeColumn(),
      createdColumn(),
    ],
    actions: buildActions(options),
    emptyState: buildEmptyState(options.canUpload, options.onUpload),
  };
}
