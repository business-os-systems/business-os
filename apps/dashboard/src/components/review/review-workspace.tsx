"use client";

import React from "react";
import Link from "next/link";
import { Spinner } from "@suite/ui";
import { ArrowLeftIcon } from "@suite/ui/icons";
import { workspacePath } from "@/lib/workspace-paths";
import { ReviewControls } from "./review-controls";
import { ReviewPageList } from "./review-page-list";
import { ReviewPreview } from "./review-preview";
import { useReview } from "./use-review";

function ReviewMessage(props: { readonly siteId: string; readonly title: string; readonly detail: string }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <p className="text-sm font-semibold text-text">{props.title}</p>
      <p role="alert" className="max-w-xl whitespace-pre-wrap text-xs text-danger">{props.detail}</p>
      <Link
        href={workspacePath("/sites/" + props.siteId + "/studio")}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-text hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <ArrowLeftIcon size={14} />
        Back to studio
      </Link>
    </div>
  );
}

/** The review surface owns the only live publish control in the application. */
export function ReviewWorkspace({ siteId }: { readonly siteId: string }) {
  const state = useReview(siteId);
  if (state.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 bg-background text-xs text-text-secondary">
        <Spinner />
        <span>Opening the site review...</span>
      </div>
    );
  }
  if (state.review === null || state.result === null) {
    return (
      <ReviewMessage
        siteId={siteId}
        title="The review could not be opened"
        detail={state.problem?.detail ?? state.errorMessage ?? "The server returned no review."}
      />
    );
  }
  return (
    <div data-app="website-builder" className="flex h-screen flex-col overflow-hidden bg-background text-text">
      <ReviewControls
        siteId={siteId}
        review={state.review}
        canPublish={state.result.canPublish}
        viewMode={state.viewMode}
        device={state.device}
        changeNote={state.changeNote}
        isPublishing={state.isPublishing}
        problem={state.problem}
        errorMessage={state.errorMessage}
        published={state.published}
        onViewMode={state.setViewMode}
        onDevice={state.setDevice}
        onChangeNote={state.setChangeNote}
        onPublish={() => void state.publish()}
      />
      <div className="flex min-h-0 flex-1">
        <ReviewPageList
          pages={state.review.pages}
          selectedPageId={state.selectedPageId}
          onSelect={state.selectPage}
        />
        <ReviewPreview
          page={state.selectedPage}
          media={state.review.media}
          device={state.device}
          viewMode={state.viewMode}
        />
      </div>
    </div>
  );
}
