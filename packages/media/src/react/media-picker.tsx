"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import { Button, Input, Label, Modal, Select, Spinner } from "@suite/ui";
import { PERMISSIONS, hasPermission } from "@suite/core";
import type { MediaAssetView, MediaUsageView } from "../contracts.js";
import { MEDIA_DEFAULT_PAGE_SIZE, type MediaClient } from "./media-client.js";
import {
  buildMediaListQuery,
  MEDIA_TYPE_FILTER_OPTIONS,
  toMediaTypeFilter,
  type MediaFilterState,
} from "./media-query.js";
import { MediaUploadDialog } from "./media-upload-dialog.js";
import { MediaAccessDeniedAlert } from "./media-access-denied.js";
import { useMediaAssets } from "./use-media-assets.js";
import { MediaProblemAlert } from "./media-problem-alert.js";

export interface MediaPickerProps {
  readonly client: MediaClient;
  readonly userPermissions: readonly string[];
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSelect: (asset: MediaAssetView) => void;
  readonly title?: string;
  readonly description?: string;
}

interface PickerBodyProps {
  readonly client: MediaClient;
  readonly canUpload: boolean;
  readonly onSelect: (asset: MediaAssetView) => void;
}

type UsageState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly usages: readonly MediaUsageView[] };

function usageLocation(usage: MediaUsageView): string {
  const suffix = usage.subKey.length === 0 ? "" : " · " + usage.subKey;
  return usage.appId + " · " + usage.resourceType + " " + usage.resourceId + suffix;
}

function UsageDetails(props: { readonly state: UsageState }) {
  if (props.state.kind === "loading") {
    return <p className="mt-2 text-[11px] text-text-muted">Loading usage…</p>;
  }
  if (props.state.kind === "error") {
    return (
      <p role="alert" className="mt-2 text-[11px] text-danger">
        {props.state.message}
      </p>
    );
  }
  if (props.state.usages.length === 0) {
    return (
      <p className="mt-2 text-[11px] text-text-muted">
        Not referenced by any content.
      </p>
    );
  }
  return (
    <ul className="mt-2 space-y-1">
      {props.state.usages.map((usage) => (
        <li key={usage.id} className="font-mono text-[11px] text-text-secondary">
          {usageLocation(usage)} · {usage.status}
        </li>
      ))}
    </ul>
  );
}

function MediaUsageLocations(props: {
  readonly client: MediaClient;
  readonly assetId: string;
  readonly onClose: () => void;
}) {
  const [state, setState] = useState<UsageState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    props.client
      .getAsset(props.assetId)
      .then((detail) => {
        if (active) {
          setState({ kind: "ready", usages: detail.usages });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [props.client, props.assetId]);

  return (
    <div className="rounded-md border border-border bg-surface-muted p-3" role="region" aria-label="Asset usage">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Referencing locations
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={props.onClose}>
          Close
        </Button>
      </div>
      <UsageDetails state={state} />
    </div>
  );
}

interface PickerToolbarProps {
  readonly filter: MediaFilterState;
  readonly searchDraft: string;
  readonly canUpload: boolean;
  readonly onSearchDraftChange: (value: string) => void;
  readonly onSearchSubmit: () => void;
  readonly onTypeChange: (value: string) => void;
  readonly onUpload: () => void;
}

function PickerAssetCard({
  asset,
  onSelect,
  onInspectUsage,
}: {
  readonly asset: MediaAssetView;
  readonly onSelect: (asset: MediaAssetView) => void;
  readonly onInspectUsage: (assetId: string) => void;
}) {
  return (
    <li className="rounded-lg border border-border bg-surface p-2">
      <div className="flex h-28 items-center justify-center overflow-hidden rounded-md bg-surface-muted">
        <img
          src={asset.url}
          alt={asset.fileName}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <p className="mt-2 truncate text-xs font-semibold text-text" title={asset.fileName}>
        {asset.fileName}
      </p>
      <p className="text-[11px] text-text-muted">
        {asset.usageCount === 0
          ? "Unused"
          : `Used in ${asset.usageCount} location(s)`}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-2 w-full"
        aria-label={`Use ${asset.fileName}`}
        onClick={() => onSelect(asset)}
      >
        Use asset
      </Button>
      {asset.usageCount === 0 ? null : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-1 w-full"
          aria-label={`View usage for ${asset.fileName}`}
          onClick={() => onInspectUsage(asset.id)}
        >
          View usage
        </Button>
      )}
    </li>
  );
}

function PickerGrid({
  assets,
  onSelect,
  onInspectUsage,
}: {
  readonly assets: readonly MediaAssetView[];
  readonly onSelect: (asset: MediaAssetView) => void;
  readonly onInspectUsage: (assetId: string) => void;
}) {
  if (assets.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-text-muted">
        No assets match this search. Upload an image or change the filter.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {assets.map((asset) => (
        <PickerAssetCard
          key={asset.id}
          asset={asset}
          onSelect={onSelect}
          onInspectUsage={onInspectUsage}
        />
      ))}
    </ul>
  );
}

function PickerToolbar({
  filter,
  searchDraft,
  canUpload,
  onSearchDraftChange,
  onSearchSubmit,
  onTypeChange,
  onUpload,
}: PickerToolbarProps) {
  const searchId = useId();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <form
        className="flex flex-1 items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSearchSubmit();
        }}
      >
        <div className="flex-1 space-y-1">
          <Label htmlFor={searchId}>Search assets</Label>
          <Input
            id={searchId}
            type="search"
            value={searchDraft}
            placeholder="Search by file name"
            onChange={(event) => onSearchDraftChange(event.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      <div className="w-full sm:w-40">
        <Label htmlFor={`${searchId}-type`}>Type</Label>
        <Select
          id={`${searchId}-type`}
          value={filter.type}
          options={MEDIA_TYPE_FILTER_OPTIONS.map((option) => ({
            label: option.label,
            value: option.value,
          }))}
          onChange={onTypeChange}
        />
      </div>
      {canUpload ? (
        <Button type="button" onClick={onUpload} className="w-full sm:w-auto">
          Upload
        </Button>
      ) : null}
    </div>
  );
}

function PickerResults({
  loading,
  assets,
  error,
  hasMore,
  onSelect,
  onInspectUsage,
  onLoadMore,
}: {
  readonly loading: boolean;
  readonly assets: readonly MediaAssetView[];
  readonly error: Error | null;
  readonly hasMore: boolean;
  readonly onSelect: (asset: MediaAssetView) => void;
  readonly onInspectUsage: (assetId: string) => void;
  readonly onLoadMore: () => void;
}) {
  if (error !== null) {
    return <MediaProblemAlert error={error} title="Could not load media" />;
  }
  if (loading && assets.length === 0) {
    return (
      <div className="flex items-center justify-center p-8" role="status">
        <Spinner size="lg" color="action" />
        <span className="ml-2 text-xs text-text-muted">Loading assets…</span>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <PickerGrid assets={assets} onSelect={onSelect} onInspectUsage={onInspectUsage} />
      {hasMore ? (
        <Button type="button" variant="outline" isLoading={loading} onClick={onLoadMore}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}

function PickerBody({ client, canUpload, onSelect }: PickerBodyProps) {
  const [filter, setFilter] = useState<MediaFilterState>({
    search: "",
    type: "ALL",
    unusedOnly: false,
  });
  const [searchDraft, setSearchDraft] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [usageAssetId, setUsageAssetId] = useState<string | null>(null);
  const query = useMemo(
    () => buildMediaListQuery(filter, MEDIA_DEFAULT_PAGE_SIZE),
    [filter]
  );
  const assets = useMediaAssets(client, query);

  return (
    <div className="space-y-4">
      <PickerToolbar
        filter={filter}
        searchDraft={searchDraft}
        canUpload={canUpload}
        onSearchDraftChange={setSearchDraft}
        onSearchSubmit={() =>
          setFilter((previous) => ({ ...previous, search: searchDraft }))
        }
        onTypeChange={(value) =>
          setFilter((previous) => ({
            ...previous,
            type: toMediaTypeFilter(value),
          }))
        }
        onUpload={() => setIsUploadOpen(true)}
      />
      <PickerResults
        loading={assets.isLoading}
        assets={assets.assets}
        error={assets.error}
        hasMore={assets.hasMore}
        onSelect={onSelect}
        onInspectUsage={setUsageAssetId}
        onLoadMore={() => void assets.loadMore()}
      />
      {usageAssetId === null ? null : (
        <MediaUsageLocations
          client={client}
          assetId={usageAssetId}
          onClose={() => setUsageAssetId(null)}
        />
      )}
      <MediaUploadDialog
        client={client}
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploaded={() => void assets.reload()}
      />
    </div>
  );
}

/**
 * The shared media picker every application opens (FR-123). It depends only on
 * the transport port and capability claims; no application, route or resource
 * identifier can leak into it.
 */
export function MediaPicker({
  client,
  userPermissions,
  isOpen,
  onClose,
  onSelect,
  title = "Choose media",
  description = "Search the shared workspace library or upload a new image.",
}: MediaPickerProps) {
  const canRead = hasPermission(userPermissions, PERMISSIONS.MEDIA.READ);
  const canUpload = hasPermission(userPermissions, PERMISSIONS.MEDIA.UPLOAD);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={title}
      description={description}
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          Done
        </Button>
      }
    >
      {canRead ? (
        <PickerBody client={client} canUpload={canUpload} onSelect={onSelect} />
      ) : (
        <MediaAccessDeniedAlert />
      )}
    </Modal>
  );
}
