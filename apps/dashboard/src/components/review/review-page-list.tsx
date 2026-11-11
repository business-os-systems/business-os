"use client";

import React from "react";
import type { ReviewPageDto } from "@/lib/api/review-client";
import { REVIEW_PAGE_STATE, pageStateKey } from "./review.config";

export interface ReviewPageListProps {
  readonly pages: readonly ReviewPageDto[];
  readonly selectedPageId: string | null;
  readonly onSelect: (pageId: string) => void;
}

function PageRow(props: {
  readonly page: ReviewPageDto;
  readonly selected: boolean;
  readonly onSelect: (pageId: string) => void;
}) {
  const state = REVIEW_PAGE_STATE[pageStateKey(props.page)];
  return (
    <li>
      <button
        type="button"
        onClick={() => props.onSelect(props.page.pageId)}
        aria-current={props.selected ? "page" : undefined}
        className={
          "w-full rounded-md px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
          (props.selected ? "bg-action-tint" : "hover:bg-surface-hover")
        }
      >
        <span className="block text-xs font-semibold text-text">{props.page.title}</span>
        <span className="mt-0.5 block truncate font-mono text-[10px] text-text-muted">
          {props.page.path}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
          <span className={"font-semibold " + state.className}>{state.label}</span>
          <span className="text-text-muted">
            {props.page.reviewed ? "Reviewed" : "Not reviewed"}
          </span>
          {props.page.stale ? <span className="font-semibold text-danger">Stale</span> : null}
        </span>
      </button>
    </li>
  );
}

/** Navigable list of every page in the site; every row opens the preview. */
export function ReviewPageList({ pages, selectedPageId, onSelect }: ReviewPageListProps) {
  return (
    <nav aria-label="Site pages" className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border px-3 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Pages in this release
        </h2>
        <p className="mt-1 text-[11px] text-text-muted">
          {String(pages.filter((page) => page.changed).length)} changed of {String(pages.length)}
        </p>
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto p-2">
        {pages.map((page) => (
          <PageRow
            key={page.pageId}
            page={page}
            selected={page.pageId === selectedPageId}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </nav>
  );
}
