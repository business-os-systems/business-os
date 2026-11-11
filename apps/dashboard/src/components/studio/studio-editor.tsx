"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@suite/ui";
import { StudioEditorSession } from "./studio-editor-session";
import { StudioSiteLinks } from "./studio-site-links";
import type { StudioEditorProps } from "./studio-editor-props";
import { usePageContent } from "./use-page-content";

export type { StudioEditorProps } from "./studio-editor-props";

function EditorState(props: { readonly children: React.ReactNode }) {
  return (
    <main
      role="region"
      aria-label="Canvas"
      className="flex min-w-0 flex-1 items-center justify-center bg-surface-sunken p-8 text-center text-xs text-text-muted"
    >
      {props.children}
    </main>
  );
}

function EditorLoading(props: {
  readonly siteId: string;
  readonly message: string;
  readonly userPermissions: readonly string[];
}) {
  return (
    <>
      <EditorState>{props.message}</EditorState>
      <aside
        role="region"
        aria-label="Inspector"
        className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-surface p-4"
      >
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Inspector</h2>
        <p className="mt-2 text-xs text-text-muted">Select a block on the canvas to edit it.</p>
        <div className="mt-auto border-t border-border pt-3">
          <StudioSiteLinks siteId={props.siteId} userPermissions={props.userPermissions} />
        </div>
      </aside>
    </>
  );
}

/** Loads page content, then hands the session a stable initial snapshot. */
export function StudioEditor(props: StudioEditorProps) {
  const pageContent = usePageContent(props.page.id);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted || pageContent.state.kind === "loading") {
    return (
      <EditorLoading
        siteId={props.site.id}
        message="Loading the editor..."
        userPermissions={props.userPermissions}
      />
    );
  }
  if (pageContent.state.kind === "error") {
    return (
      <EditorState>
        <div className="flex flex-col items-center gap-2">
          <p role="alert" className="text-sm font-medium text-danger">{pageContent.state.message}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void pageContent.reload()}>
            Try again
          </Button>
        </div>
      </EditorState>
    );
  }
  return <StudioEditorSession {...props} content={pageContent.state.content} />;
}
