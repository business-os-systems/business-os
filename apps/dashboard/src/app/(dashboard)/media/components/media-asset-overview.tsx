import React from "react";
import {
  formatMediaFileSize,
  formatMediaTimestamp,
  type MediaAssetDetail,
} from "@suite/media/react";

function MetadataRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-xs text-text">{value}</dd>
    </div>
  );
}

function formatDimensions(detail: MediaAssetDetail): string {
  if (detail.width === null || detail.height === null) {
    return "Not recorded";
  }
  return `${detail.width} × ${detail.height} px`;
}

export function MediaAssetOverview({ detail }: { readonly detail: MediaAssetDetail }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <img
        src={detail.url}
        alt={detail.fileName}
        className="h-40 w-full rounded-lg border border-border bg-surface-muted object-contain sm:w-56"
      />
      <dl className="grid flex-1 grid-cols-2 gap-3">
        <MetadataRow label="File name" value={detail.fileName} />
        <MetadataRow label="Type" value={detail.mimeType} />
        <MetadataRow label="Size" value={formatMediaFileSize(detail.sizeBytes)} />
        <MetadataRow label="Dimensions" value={formatDimensions(detail)} />
        <MetadataRow label="Uploaded" value={formatMediaTimestamp(detail.createdAt)} />
        <MetadataRow
          label="Status"
          value={detail.status === "ACTIVE" ? "Active" : "Archived"}
        />
      </dl>
    </div>
  );
}
