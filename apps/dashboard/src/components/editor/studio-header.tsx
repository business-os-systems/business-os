"use client";

import React from "react";
import Link from "next/link";
import { Badge, Button } from "@suite/ui";
import {
  LayersIcon,
  SettingsIcon,
  EyeIcon,
  PlusIcon,
} from "@suite/ui/icons";
import type { StudioHeaderProps, AutosaveStatus } from "./types";

const STATUS_VARIANTS: Record<
  StudioHeaderProps["status"],
  "default" | "secondary" | "tertiary"
> = {
  PUBLISHED: "secondary",
  DRAFT: "tertiary",
};

const AUTOSAVE_CONFIG: Record<
  AutosaveStatus,
  { label: string; dotClass: string; badgeClass: string }
> = {
  saved: {
    label: "Saved",
    dotClass: "bg-success",
    badgeClass: "text-success border-success/30 bg-success/10",
  },
  saving: {
    label: "Saving...",
    dotClass: "bg-warning-fill animate-pulse",
    badgeClass: "text-warning border-warning/30 bg-warning/10",
  },
  dirty: {
    label: "Unsaved changes",
    dotClass: "bg-action",
    badgeClass: "text-action border-action/30 bg-action-tint",
  },
  conflict: {
    label: "Conflict",
    dotClass: "bg-danger animate-ping",
    badgeClass: "text-danger border-danger/30 bg-danger/10",
  },
  error: {
    label: "Save error",
    dotClass: "bg-danger",
    badgeClass: "text-danger border-danger/30 bg-danger/10",
  },
  idle: {
    label: "Ready",
    dotClass: "bg-text-disabled",
    badgeClass: "text-text-muted border-border bg-surface-muted",
  },
};

export function StudioHeader({
  siteId,
  pageId,
  pageTitle,
  revision,
  status,
  autosaveStatus = "idle",
  isLayersOpen,
  isInspectorOpen,
  onToggleLayers,
  onToggleInspector,
  onOpenAddDrawer,
  onFlushSave,
  onPublish,
  isPublishing = false,
  versionsCount,
}: StudioHeaderProps) {
  const currentAutosave = AUTOSAVE_CONFIG[autosaveStatus] || AUTOSAVE_CONFIG.idle;

  return (
    <header className="h-14 border-b border-border bg-surface px-4 flex items-center justify-between text-text select-none z-30">
      {/* Left: Navigation & Page Identity */}
      <div className="flex items-center gap-3">
        <Link
          href={`/sites/${siteId}/pages`}
          className="text-xs font-medium text-text-secondary hover:text-text transition-colors flex items-center gap-1.5 px-2.5 py-1.5 rounded-DEFAULT hover:bg-surface-hover"
        >
          <span>&larr;</span>
          <span>Exit Studio</span>
        </Link>

        <div className="h-4 w-px bg-border" />

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-text-muted max-w-[120px] truncate">
            {siteId}
          </span>
          <span className="text-text-disabled">/</span>
          <span className="text-xs font-semibold text-text">{pageTitle}</span>
          <Badge variant={STATUS_VARIANTS[status]} className="text-[10px] ml-1">
            {status}
          </Badge>
          {typeof versionsCount === "number" && versionsCount > 0 && (
            <span className="text-[10px] font-mono text-text-muted bg-surface-muted border border-border px-1.5 py-0.5 rounded">
              {`v${versionsCount} snapshots`}
            </span>
          )}
        </div>
      </div>

      {/* Center: Concurrency & Autosave Status */}
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-muted border border-border text-[11px] font-mono text-text-secondary">
          <span className="h-2 w-2 rounded-full bg-action" />
          <span>{`CAS Revision: v${revision}`}</span>
        </span>

        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono transition-colors duration-200 ${currentAutosave.badgeClass}`}
        >
          <span className={`h-2 w-2 rounded-full ${currentAutosave.dotClass}`} />
          <span>{currentAutosave.label}</span>
        </span>
      </div>

      {/* Right: Controls & Toggles */}
      <div className="flex items-center gap-2">
        {onFlushSave && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onFlushSave}
            disabled={autosaveStatus === "saving" || autosaveStatus === "saved"}
            className="h-8 gap-1.5 text-xs disabled:opacity-40"
          >
            <span>Save</span>
          </Button>
        )}

        {onPublish && (
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={onPublish}
            disabled={isPublishing}
            className="h-8 gap-1.5 font-medium text-xs disabled:opacity-50"
          >
            <span>{isPublishing ? "Publishing..." : "Publish"}</span>
          </Button>
        )}

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onOpenAddDrawer}
          className="h-8 gap-1.5 text-xs"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <span>Add Block</span>
        </Button>

        <Link href={`/sites/${siteId}/preview/${pageId}`}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
          >
            <EyeIcon className="w-3.5 h-3.5" />
            <span>Preview</span>
          </Button>
        </Link>

        <div className="h-4 w-px bg-border" />

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onToggleLayers}
          className={`h-8 gap-1.5 text-xs ${
            isLayersOpen
              ? "border-brand bg-brand-tint text-brand font-medium"
              : "border-border-strong text-text hover:bg-surface-hover"
          }`}
          title="Toggle Layers Sidebar"
        >
          <LayersIcon className="w-3.5 h-3.5" />
          <span>Layers</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onToggleInspector}
          className={`h-8 gap-1.5 text-xs ${
            isInspectorOpen
              ? "border-brand bg-brand-tint text-brand font-medium"
              : "border-border-strong text-text hover:bg-surface-hover"
          }`}
          title="Toggle Property Inspector"
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          <span>Inspector</span>
        </Button>
      </div>
    </header>
  );
}
