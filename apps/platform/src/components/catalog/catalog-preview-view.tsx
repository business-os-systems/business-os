"use client";

import Link from "next/link";
import { cn } from "@suite/ui";
import {
  CATALOG_STATUS_LABELS,
  type CatalogItem,
} from "@/lib/catalog-api";
import { formatDateTime } from "@/lib/format";
import { CatalogPreviewSurface } from "./catalog-preview-surface";
import { CatalogPublishCard } from "./catalog-publish-card";
import { CATALOG_PANEL_CONFIGS, catalogStatusClassName } from "./catalog-list.config";
import type {
  CatalogPreviewRecordingState,
  CatalogPublishError,
} from "./catalog-preview-state";

interface CatalogPreviewViewProps {
  readonly item: CatalogItem;
  readonly recording: CatalogPreviewRecordingState;
  readonly canPublish: boolean;
  readonly isPublishing: boolean;
  readonly changeNote: string;
  readonly publishError: CatalogPublishError | null;
  readonly publishSuccess: string | null;
  readonly backHref: string;
  readonly onNoteChange: (value: string) => void;
  readonly onPublish: () => void;
  readonly onRePreview: () => void;
}

function PreviewHeader({ item, backHref }: { readonly item: CatalogItem; readonly backHref: string }) {
  return (
    <header className="space-y-1">
      <Link href={backHref} className="text-xs font-medium text-brand hover:underline">
        Back to {CATALOG_PANEL_CONFIGS[item.kind].title}
      </Link>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        Catalog preview
      </p>
      <h1 className="text-2xl font-semibold">{item.name}</h1>
      <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
        <span className="font-mono">{item.slug}</span>
        <span className={cn("font-semibold", catalogStatusClassName(item.status))}>
          {CATALOG_STATUS_LABELS[item.status]}
        </span>
        <span>Draft version v{item.draftVersion ?? "-"}</span>
        <span>Published version v{item.currentVersion}</span>
        {item.publishedAt === null ? null : <span>Published {formatDateTime(item.publishedAt)}</span>}
      </div>
    </header>
  );
}

export function CatalogPreviewView(props: CatalogPreviewViewProps) {
  return (
    <div className="space-y-4">
      <PreviewHeader item={props.item} backHref={props.backHref} />
      <CatalogPreviewSurface item={props.item} />
      <CatalogPublishCard
        item={props.item}
        recording={props.recording}
        canPublish={props.canPublish}
        isPublishing={props.isPublishing}
        changeNote={props.changeNote}
        publishError={props.publishError}
        publishSuccess={props.publishSuccess}
        onNoteChange={props.onNoteChange}
        onPublish={props.onPublish}
        onRePreview={props.onRePreview}
      />
    </div>
  );
}
