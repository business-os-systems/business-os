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
  "default" | "secondary"
> = {
  PUBLISHED: "default",
  DRAFT: "secondary",
};

const AUTOSAVE_CONFIG: Record<
  AutosaveStatus,
  { label: string; dotClass: string; badgeClass: string }
> = {
  saved: {
    label: "Saved",
    dotClass: "bg-emerald-400",
    badgeClass: "text-emerald-300 border-emerald-800/60 bg-emerald-950/40",
  },
  saving: {
    label: "Saving...",
    dotClass: "bg-amber-400 animate-pulse",
    badgeClass: "text-amber-300 border-amber-800/60 bg-amber-950/40",
  },
  dirty: {
    label: "Unsaved changes",
    dotClass: "bg-sky-400",
    badgeClass: "text-sky-300 border-sky-800/60 bg-sky-950/40",
  },
  conflict: {
    label: "Conflict",
    dotClass: "bg-red-400 animate-ping",
    badgeClass: "text-red-300 border-red-800/60 bg-red-950/40",
  },
  error: {
    label: "Save error",
    dotClass: "bg-rose-400",
    badgeClass: "text-rose-300 border-rose-800/60 bg-rose-950/40",
  },
  idle: {
    label: "Ready",
    dotClass: "bg-slate-400",
    badgeClass: "text-slate-300 border-slate-700/60 bg-slate-800/80",
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
}: StudioHeaderProps) {
  const currentAutosave = AUTOSAVE_CONFIG[autosaveStatus] || AUTOSAVE_CONFIG.idle;

  return (
    <header className="h-14 border-b border-slate-800 bg-slate-900 px-4 flex items-center justify-between text-white select-none z-30">
      {/* Left: Navigation & Page Identity */}
      <div className="flex items-center gap-3">
        <Link
          href={`/sites/${siteId}/pages`}
          className="text-xs font-medium text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-800"
        >
          <span>&larr;</span>
          <span>Exit Studio</span>
        </Link>

        <div className="h-4 w-px bg-slate-800" />

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-400 max-w-[120px] truncate">
            {siteId}
          </span>
          <span className="text-slate-600">/</span>
          <span className="text-xs font-semibold text-slate-200">{pageTitle}</span>
          <Badge variant={STATUS_VARIANTS[status]} className="text-[10px] ml-1">
            {status}
          </Badge>
        </div>
      </div>

      {/* Center: Concurrency & Autosave Status */}
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-[11px] font-mono text-slate-300">
          <span className="h-2 w-2 rounded-full bg-blue-400" />
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
            className="h-8 gap-1.5 border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white text-xs disabled:opacity-40"
          >
            <span>Save</span>
          </Button>
        )}

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onOpenAddDrawer}
          className="h-8 gap-1.5 border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white text-xs"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <span>Add Block</span>
        </Button>

        <Link href={`/sites/${siteId}/preview/${pageId}`}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white text-xs"
          >
            <EyeIcon className="w-3.5 h-3.5" />
            <span>Preview</span>
          </Button>
        </Link>

        <div className="h-4 w-px bg-slate-800" />

        <Button
          type="button"
          size="sm"
          variant={isLayersOpen ? "default" : "outline"}
          onClick={onToggleLayers}
          className={`h-8 gap-1.5 text-xs ${
            isLayersOpen
              ? "bg-blue-600 text-white hover:bg-blue-500"
              : "border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
          }`}
          title="Toggle Layers Sidebar"
        >
          <LayersIcon className="w-3.5 h-3.5" />
          <span>Layers</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant={isInspectorOpen ? "default" : "outline"}
          onClick={onToggleInspector}
          className={`h-8 gap-1.5 text-xs ${
            isInspectorOpen
              ? "bg-blue-600 text-white hover:bg-blue-500"
              : "border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
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
