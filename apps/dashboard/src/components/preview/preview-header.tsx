"use client";

import React from "react";
import Link from "next/link";
import { Badge, Button } from "@suite/ui";
import {
  SmartphoneIcon,
  TabletIcon,
  MonitorIcon,
  ArrowRightIcon,
  GlobeIcon,
} from "@suite/ui/icons";
import type { PreviewHeaderProps, PreviewDevice } from "./types";

const DEVICE_BUTTONS: Array<{
  id: PreviewDevice;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}> = [
  { id: "desktop", label: "Desktop", icon: MonitorIcon },
  { id: "tablet", label: "Tablet", icon: TabletIcon },
  { id: "mobile", label: "Mobile", icon: SmartphoneIcon },
  { id: "responsive", label: "Fluid", icon: GlobeIcon },
];

export function PreviewHeader({
  siteId,
  pageId,
  pageTitle,
  device,
  onDeviceChange,
}: PreviewHeaderProps) {
  return (
    <header className="h-14 border-b border-slate-800 bg-slate-900 px-4 flex items-center justify-between text-white select-none z-30">
      {/* Left: Navigation & Preview Indicator */}
      <div className="flex items-center gap-3">
        <Link
          href={`/sites/${siteId}/pages`}
          className="text-xs font-medium text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-800"
        >
          <span>&larr;</span>
          <span>Exit Preview</span>
        </Link>

        <div className="h-4 w-px bg-slate-800" />

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-400 max-w-[120px] truncate">
            {siteId}
          </span>
          <span className="text-slate-600">/</span>
          <span className="text-xs font-semibold text-slate-200">{pageTitle}</span>
          <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-500 ml-1">
            Live Preview
          </Badge>
        </div>
      </div>

      {/* Center: Device Viewport Simulation Selector */}
      <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
        {DEVICE_BUTTONS.map((btn) => {
          const Icon = btn.icon;
          const isActive = device === btn.id;

          return (
            <button
              key={btn.id}
              type="button"
              onClick={() => onDeviceChange(btn.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{btn.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right: Switch to Studio Editor */}
      <div className="flex items-center gap-2">
        <Link href={`/sites/${siteId}/editor/${pageId}`}>
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs"
          >
            <span>Edit in Studio</span>
            <ArrowRightIcon className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>
    </header>
  );
}
