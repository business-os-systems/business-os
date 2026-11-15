"use client";

import type { ReactNode } from "react";
import { Button, cn } from "@suite/ui";

/** Widths are named for the operator; the pixel values stay in this table. */
export const CATALOG_PREVIEW_WIDTH_IDS = ["fit", "mobile", "tablet", "desktop"] as const;
export type CatalogPreviewWidthId = (typeof CATALOG_PREVIEW_WIDTH_IDS)[number];

export const CATALOG_PREVIEW_WIDTHS = {
  fit: { label: "Fit", width: null },
  mobile: { label: "Mobile", width: 375 },
  tablet: { label: "Tablet", width: 768 },
  desktop: { label: "Desktop", width: 1280 },
} as const satisfies Record<CatalogPreviewWidthId, { label: string; width: number | null }>;

export interface CatalogPreviewWidthControlProps {
  readonly widthId: CatalogPreviewWidthId;
  readonly onWidthChange: (widthId: CatalogPreviewWidthId) => void;
}

/** One control for every preview, so the editor and the recorded route agree. */
export function CatalogPreviewWidthControl(props: CatalogPreviewWidthControlProps) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Preview width">
      {CATALOG_PREVIEW_WIDTH_IDS.map((candidate) => (
        <Button
          key={candidate}
          type="button"
          size="sm"
          variant={candidate === props.widthId ? "default" : "secondary"}
          aria-pressed={candidate === props.widthId}
          onClick={() => props.onWidthChange(candidate)}
        >
          {CATALOG_PREVIEW_WIDTHS[candidate].label}
        </Button>
      ))}
    </div>
  );
}

export interface CatalogPreviewFrameProps {
  readonly widthId: CatalogPreviewWidthId;
  readonly children: ReactNode;
  readonly caption?: string;
}

/**
 * The frame every catalog preview renders inside. A fixed width scrolls
 * horizontally instead of squeezing the console, and Fit fills the pane.
 */
export function CatalogPreviewFrame(props: CatalogPreviewFrameProps) {
  const width = CATALOG_PREVIEW_WIDTHS[props.widthId].width;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border bg-surface-sunken p-3">
        <div
          className={cn(
            "mx-auto min-h-80 overflow-hidden rounded-md border border-border bg-surface",
            width === null && "w-full"
          )}
          aria-label="Preview"
          data-testid="catalog-preview-frame"
          data-preview-width={props.widthId}
          style={width === null ? undefined : { width }}
        >
          {props.children}
        </div>
      </div>
      {props.caption === undefined ? null : (
        <p className="text-xs text-text-muted">{props.caption}</p>
      )}
    </div>
  );
}
