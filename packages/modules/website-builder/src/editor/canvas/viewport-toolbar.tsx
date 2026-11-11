import React from "react";
import { Button } from "@suite/ui";
import {
  MonitorIcon,
  RotateCcwIcon,
  SmartphoneIcon,
  TabletIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "@suite/ui/icons";
import type { ViewportConfig, ViewportDevice } from "./types.js";

export const VIEWPORT_CONFIGS: Record<ViewportDevice, ViewportConfig> = {
  mobile: { device: "mobile", width: 375, label: "Mobile (375px)" },
  tablet: { device: "tablet", width: 768, label: "Tablet (768px)" },
  desktop: { device: "desktop", width: 1280, label: "Desktop (1280px)" },
};

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;

interface DeviceOption {
  readonly device: ViewportDevice;
  readonly label: string;
  readonly Icon: typeof MonitorIcon;
}

const DEVICE_OPTIONS: readonly DeviceOption[] = [
  { device: "desktop", label: "Desktop", Icon: MonitorIcon },
  { device: "tablet", label: "Tablet", Icon: TabletIcon },
  { device: "mobile", label: "Mobile", Icon: SmartphoneIcon },
];

export interface ViewportToolbarProps {
  readonly device: ViewportDevice;
  readonly zoom: number;
  readonly onDeviceChange: (device: ViewportDevice) => void;
  readonly onZoomChange: (zoom: number) => void;
}

function clampZoom(value: number): number {
  return Math.min(Math.max(value, ZOOM_MIN), ZOOM_MAX);
}

function DeviceButton(props: {
  readonly option: DeviceOption;
  readonly active: boolean;
  readonly onSelect: (device: ViewportDevice) => void;
}) {
  const { option, active, onSelect } = props;
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "ghost"}
      aria-pressed={active}
      aria-label={"Switch to " + option.label + " view"}
      onClick={() => onSelect(option.device)}
      className="flex items-center gap-1.5"
    >
      <option.Icon size={16} />
      <span className="hidden text-xs font-medium sm:inline">{option.label}</span>
    </Button>
  );
}

function ZoomControls(props: { readonly zoom: number; readonly onZoomChange: (zoom: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Zoom controls">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => props.onZoomChange(clampZoom(props.zoom - ZOOM_STEP))}
        disabled={props.zoom <= ZOOM_MIN}
        aria-label="Zoom out"
        className="h-8 w-8"
      >
        <ZoomOutIcon size={15} />
      </Button>
      <span
        className="min-w-12 px-2 text-center font-mono text-xs font-semibold text-text-secondary"
        aria-label="Current zoom level"
      >
        {Math.round(props.zoom * 100) + "%"}
      </span>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => props.onZoomChange(clampZoom(props.zoom + ZOOM_STEP))}
        disabled={props.zoom >= ZOOM_MAX}
        aria-label="Zoom in"
        className="h-8 w-8"
      >
        <ZoomInIcon size={15} />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => props.onZoomChange(1)}
        aria-label="Reset zoom to 100%"
        className="h-8 w-8 text-text-muted hover:text-text"
      >
        <RotateCcwIcon size={14} />
      </Button>
    </div>
  );
}

/** Viewport and zoom controls for the canvas. Token-only chrome (FR-025). */
export function ViewportToolbar(props: ViewportToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Canvas viewport controls"
      className="flex select-none items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2 text-text"
    >
      <div className="flex items-center gap-1" role="group" aria-label="Device viewport">
        {DEVICE_OPTIONS.map((option) => (
          <DeviceButton
            key={option.device}
            option={option}
            active={option.device === props.device}
            onSelect={props.onDeviceChange}
          />
        ))}
      </div>
      <span className="rounded-md bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-text-secondary">
        {VIEWPORT_CONFIGS[props.device].label}
      </span>
      <ZoomControls zoom={props.zoom} onZoomChange={props.onZoomChange} />
    </div>
  );
}
