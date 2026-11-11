"use client";

import React from "react";
import {
  PageAstSchema,
  type MediaAssetMap,
  type PageAst,
} from "@suite/website-builder/ast";
import { AstRenderer } from "@suite/website-builder/render";
import type { ReviewPageDto } from "@/lib/api/review-client";
import { resolveDevice, type ReviewDeviceId, type ReviewViewMode } from "./review.config";

export interface ReviewPreviewProps {
  readonly page: ReviewPageDto | null;
  readonly media: MediaAssetMap;
  readonly device: ReviewDeviceId;
  readonly viewMode: ReviewViewMode;
}

function parsePreviewAst(value: unknown): PageAst | null {
  const parsed = PageAstSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function EmptyPreview(props: { readonly message: string }) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-2 p-12 text-center">
      <p className="text-sm font-semibold text-text">{props.message}</p>
      <p className="max-w-md text-xs text-text-secondary">
        Choose another page or open the studio to author this content.
      </p>
    </div>
  );
}

/** Renders one page at the selected device width exactly as a visitor will see it. */
export function ReviewPreview({ page, media, device, viewMode }: ReviewPreviewProps) {
  const viewport = resolveDevice(device);
  if (page === null) {
    return <EmptyPreview message="Select a page to review" />;
  }
  const source = viewMode === "live" ? page.publishedAst : page.draftAst;
  if (source === null || source === undefined) {
    return <EmptyPreview message="This page is not live yet" />;
  }
  const ast = parsePreviewAst(source);
  if (ast === null) {
    return <EmptyPreview message="This page content cannot be rendered" />;
  }
  return (
    <div
      className="flex flex-1 justify-center overflow-auto bg-surface-sunken p-6"
      data-review-device={device}
      role="region"
      aria-label="Page preview"
      tabIndex={0}
    >
      <div
        className="shrink-0 overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
        style={{ width: viewport.width }}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface-muted px-4 py-2 text-[11px] text-text-secondary">
          <span className="font-mono">{page.path}</span>
          <span>
            {viewport.label} · {String(viewport.width)}px
          </span>
        </div>
        <AstRenderer ast={ast} media={media} />
      </div>
    </div>
  );
}
