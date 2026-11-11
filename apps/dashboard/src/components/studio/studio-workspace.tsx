"use client";

import React from "react";
import { Button } from "@suite/ui";
import { StudioShell } from "./studio-shell";
import { useStudioActions } from "./use-studio-actions";
import { useStudioData } from "./use-studio-data";

export interface StudioWorkspaceProps {
  readonly siteId: string;
  readonly pageId: string;
  readonly canWrite: boolean;
  readonly userPermissions: readonly string[];
  readonly currentUserId: string;
  readonly currentUserName: string;
}

function StudioState(props: { readonly children: React.ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center bg-background p-6 text-center text-xs font-medium text-text-muted">
      {props.children}
    </div>
  );
}

/**
 * Loads the site and its tree, keeps the active page in the URL and applies
 * tree mutations through the tenant API. A missing active page falls back to
 * the home page instead of showing an empty studio (FR-079).
 */
export function StudioWorkspace(props: StudioWorkspaceProps) {
  const data = useStudioData({ siteId: props.siteId, pageId: props.pageId });
  const actions = useStudioActions({
    siteId: props.siteId,
    pageId: props.pageId,
    setPages: data.setPages,
  });
  const activePage = data.pages.find((page) => page.id === props.pageId);

  if (data.isLoading) {
    return <StudioState>Loading studio...</StudioState>;
  }

  if (data.error !== null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p role="alert" className="max-w-lg text-sm font-medium text-danger">{data.error}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void data.reload()}>
          Try again
        </Button>
      </div>
    );
  }

  if (data.site === null || activePage === undefined) {
    return <StudioState>Opening the home page...</StudioState>;
  }

  return (
    <StudioShell
      site={{ ...data.site, pagesCount: data.pages.length }}
      pages={data.pages}
      activePage={activePage}
      canWrite={props.canWrite}
      userPermissions={props.userPermissions}
      currentUserId={props.currentUserId}
      currentUserName={props.currentUserName}
      onSelectPage={actions.selectPage}
      onCreatePage={actions.createPage}
      onRenamePage={actions.renamePage}
      onDeletePage={actions.removePage}
    />
  );
}
