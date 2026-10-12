import React from "react";
import { Button } from "@suite/ui";
import {
  SmartphoneIcon,
  TabletIcon,
  MonitorIcon,
  ZoomInIcon,
  ZoomOutIcon,
  RotateCcwIcon,
} from "@suite/ui/icons";
import type { ViewportDevice, ViewportConfig } from "./types.js";

export const VIEWPORT_CONFIGS: Record<ViewportDevice, ViewportConfig> = {
  mobile: { device: "mobile", width: 375, label: "Mobile (375px)" },
  tablet: { device: "tablet", width: 768, label: "Tablet (768px)" },
  desktop: { device: "desktop", width: 1280, label: "Desktop (1280px)" },
};

export interface ViewportToolbarProps {
  device: ViewportDevice;
  zoom: number;
  onDeviceChange: (device: ViewportDevice) => void;
  onZoomChange: (zoom: number) => void;
  className?: string;
}

export function ViewportToolbar({
  device,
  zoom,
  onDeviceChange,
  onZoomChange,
  className = "",
}: ViewportToolbarProps) {
  const handleZoomIn = () => {
    onZoomChange(Math.min(zoom + 0.1, 2.0));
  };

  const handleZoomOut = () => {
    onZoomChange(Math.max(zoom - 0.1, 0.5));
  };

  const handleZoomReset = () => {
    onZoomChange(1.0);
  };

  const formattedZoom = `${Math.round(zoom * 100)}%`;

  return (
    <div
      role="toolbar"
      aria-label="Viewport simulation controls"
      className={`flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200 select-none text-slate-700 ${className}`}
    >
      {/* Device Viewport Toggle Buttons */}
      <div className="flex items-center space-x-1" role="group" aria-label="Device viewport">
        <Button
          type="button"
          size="sm"
          variant={device === "desktop" ? "default" : "ghost"}
          onClick={() => onDeviceChange("desktop")}
          aria-label="Switch to desktop view"
          className="flex items-center gap-1.5"
        >
          <MonitorIcon size={16} />
          <span className="hidden sm:inline text-xs font-medium">Desktop</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant={device === "tablet" ? "default" : "ghost"}
          onClick={() => onDeviceChange("tablet")}
          aria-label="Switch to tablet view"
          className="flex items-center gap-1.5"
        >
          <TabletIcon size={16} />
          <span className="hidden sm:inline text-xs font-medium">Tablet</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant={device === "mobile" ? "default" : "ghost"}
          onClick={() => onDeviceChange("mobile")}
          aria-label="Switch to mobile view"
          className="flex items-center gap-1.5"
        >
          <SmartphoneIcon size={16} />
          <span className="hidden sm:inline text-xs font-medium">Mobile</span>
        </Button>
      </div>

      {/* Viewport Width Indicator */}
      <div className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
        {VIEWPORT_CONFIGS[device].label}
      </div>

      {/* Zoom Pan & Reset Controls */}
      <div className="flex items-center space-x-1" role="group" aria-label="Zoom controls">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={handleZoomOut}
          disabled={zoom <= 0.5}
          aria-label="Zoom out"
          className="h-8 w-8"
        >
          <ZoomOutIcon size={15} />
        </Button>

        <span
          className="text-xs font-semibold font-mono text-slate-600 px-2 min-w-12 text-center"
          aria-label="Current zoom level"
        >
          {formattedZoom}
        </span>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={handleZoomIn}
          disabled={zoom >= 2.0}
          aria-label="Zoom in"
          className="h-8 w-8"
        >
          <ZoomInIcon size={15} />
        </Button>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={handleZoomReset}
          aria-label="Reset zoom to 100%"
          className="h-8 w-8 text-slate-500 hover:text-slate-800"
        >
          <RotateCcwIcon size={14} />
        </Button>
      </div>
    </div>
  );
}
