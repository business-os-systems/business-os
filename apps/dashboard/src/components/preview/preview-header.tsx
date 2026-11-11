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
import { websiteBuilderStudioHref } from "@/components/layout/website-builder-nav.config";
import { workspacePath } from "@/lib/workspace-paths";

const DEVICE_BUTTONS: {
  id: PreviewDevice;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}[] = [
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
    <header className="h-14 border-b border-border bg-surface px-4 flex items-center justify-between text-text select-none z-30">
      {/* Left: Navigation & Preview Indicator */}
      <div className="flex items-center gap-3">
        <Link href={workspacePath(`/sites/${siteId}/pages`)}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-text-secondary hover:text-text"
            startIcon={<span>&larr;</span>}
          >
            Exit Preview
          </Button>
        </Link>

        <div className="h-4 w-px bg-border" />

        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-text-muted max-w-[120px] truncate">
            {siteId}
          </span>
          <span className="text-text-disabled">/</span>
          <span className="text-xs font-semibold text-text">{pageTitle}</span>
          <Badge variant="secondary" className="text-[10px] ml-1">
            Live Preview
          </Badge>
        </div>
      </div>

      {/* Center: Device Viewport Simulation Selector */}
      <div className="flex items-center bg-surface-muted p-1 rounded-DEFAULT border border-border">
        {DEVICE_BUTTONS.map((btn) => {
          const Icon = btn.icon;
          const isActive = device === btn.id;

          return (
            <Button
              key={btn.id}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDeviceChange(btn.id)}
              className={`h-auto flex items-center gap-1.5 px-3 py-1 rounded-DEFAULT text-xs font-medium transition-all ${
                isActive
                  ? "bg-brand-tint text-brand shadow-xs hover:bg-brand-tint hover:text-brand"
                  : "text-text-secondary hover:text-text hover:bg-surface-hover"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{btn.label}</span>
            </Button>
          );
        })}
      </div>

      {/* Right: Switch to Studio Editor */}
      <div className="flex items-center gap-2">
        <Link href={websiteBuilderStudioHref(siteId, pageId)}>
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-8 gap-1.5 text-xs"
          >
            <span>Edit in Studio</span>
            <ArrowRightIcon className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>
    </header>
  );
}
