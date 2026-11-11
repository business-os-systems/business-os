"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@suite/ui";
import { ArrowLeftIcon, EyeIcon } from "@suite/ui/icons";
import type { CmsProblem } from "@/lib/api/cms-http";
import type { PublishResult, ReviewDto } from "@/lib/api/review-client";
import { workspacePath } from "@/lib/workspace-paths";
import {
  REVIEW_CHANGE_NOTE,
  REVIEW_DEVICES,
  REVIEW_STATUS_PRESENTATION,
  REVIEW_VIEW_MODES,
  reviewSummary,
  type ReviewDeviceId,
  type ReviewViewMode,
} from "./review.config";

export interface ReviewControlsProps {
  readonly siteId: string;
  readonly review: ReviewDto;
  readonly canPublish: boolean;
  readonly viewMode: ReviewViewMode;
  readonly device: ReviewDeviceId;
  readonly changeNote: string;
  readonly isPublishing: boolean;
  readonly problem: CmsProblem | null;
  readonly errorMessage: string | null;
  readonly published: PublishResult | null;
  readonly onViewMode: (mode: ReviewViewMode) => void;
  readonly onDevice: (device: ReviewDeviceId) => void;
  readonly onChangeNote: (note: string) => void;
  readonly onPublish: () => void;
}

function ProblemPanel(props: { readonly problem: CmsProblem | null; readonly errorMessage: string | null }) {
  if (props.problem === null && props.errorMessage === null) {
    return null;
  }
  if (props.problem === null) {
    return (
      <p role="alert" className="border-t border-danger/30 bg-danger/5 px-4 py-2 text-xs text-danger">
        {props.errorMessage}
      </p>
    );
  }
  return (
    <div role="alert" className="border-t border-danger/30 bg-danger/5 px-4 py-2 text-xs text-danger">
      <p className="font-semibold">
        {String(props.problem.status)} · {props.problem.code} · {props.problem.title}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap">{props.problem.detail}</p>
      <p className="mt-0.5 font-mono text-[10px] text-text-secondary">{props.problem.type}</p>
    </div>
  );
}

function PublishControl(props: {
  readonly canPublish: boolean;
  readonly isPublishing: boolean;
  readonly published: PublishResult | null;
  readonly onPublish: () => void;
}) {
  if (!props.canPublish) {
    return (
      <span className="text-xs font-medium text-text-secondary">
        Read-only review. Publishing requires cms:publish.
      </span>
    );
  }
  if (props.published !== null) {
    return (
      <span className="text-xs font-semibold text-success">
        Published {String(props.published.pages.length)} page(s)
      </span>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="default"
      onClick={props.onPublish}
      disabled={props.isPublishing}
      data-testid="review-publish-control"
      className="h-9 gap-1.5 text-xs"
    >
      <EyeIcon className="h-3.5 w-3.5" />
      <span>{props.isPublishing ? "Publishing..." : "Publish live"}</span>
    </Button>
  );
}

function ModeToggle(props: {
  readonly viewMode: ReviewViewMode;
  readonly device: ReviewDeviceId;
  readonly onViewMode: (mode: ReviewViewMode) => void;
  readonly onDevice: (device: ReviewDeviceId) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">View</span>
      {REVIEW_VIEW_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => props.onViewMode(mode.id)}
          aria-pressed={props.viewMode === mode.id}
          className={
            "rounded-md px-2 py-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
            (props.viewMode === mode.id ? "bg-action-tint text-action" : "text-text-secondary hover:bg-surface-hover")
          }
        >
          {mode.label}
        </button>
      ))}
      <span className="mx-1 h-4 w-px bg-border" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Device</span>
      {REVIEW_DEVICES.map((device) => (
        <button
          key={device.id}
          type="button"
          onClick={() => props.onDevice(device.id)}
          aria-pressed={props.device === device.id}
          className={
            "rounded-md px-2 py-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
            (props.device === device.id ? "bg-action-tint text-action" : "text-text-secondary hover:bg-surface-hover")
          }
        >
          {device.label}
        </button>
      ))}
      <span className="ml-auto text-[11px] text-text-muted">
        Visitors still see the current live site until you publish.
      </span>
    </div>
  );
}

/** Release header: navigable view controls live here; the only publish control is Publish live. */
export function ReviewControls(props: ReviewControlsProps) {
  const status = REVIEW_STATUS_PRESENTATION[props.review.status];
  return (
    <header className="shrink-0 border-b border-border bg-surface">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Link
          href={workspacePath("/sites/" + props.siteId + "/studio")}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <ArrowLeftIcon size={14} />
          Back to studio
        </Link>
        <span className="h-5 w-px bg-border" />
        <div className="min-w-48">
          <h1 className="text-sm font-bold text-text">Review &amp; publish</h1>
          <p className="text-[11px] text-text-secondary">{reviewSummary(props.review)}</p>
        </div>
        <span className={"text-xs font-semibold " + status.className}>{status.label}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={REVIEW_CHANGE_NOTE.id}>
            {REVIEW_CHANGE_NOTE.label}
          </label>
          <input
            id={REVIEW_CHANGE_NOTE.id}
            value={props.changeNote}
            onChange={(event) => props.onChangeNote(event.target.value)}
            placeholder={REVIEW_CHANGE_NOTE.placeholder}
            maxLength={REVIEW_CHANGE_NOTE.maxLength}
            className="h-8 w-48 rounded-md border border-border bg-surface px-2 text-xs text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
          <PublishControl
            canPublish={props.canPublish}
            isPublishing={props.isPublishing}
            published={props.published}
            onPublish={props.onPublish}
          />
        </div>
      </div>
      <ModeToggle
        viewMode={props.viewMode}
        device={props.device}
        onViewMode={props.onViewMode}
        onDevice={props.onDevice}
      />
      <ProblemPanel problem={props.problem} errorMessage={props.errorMessage} />
    </header>
  );
}
