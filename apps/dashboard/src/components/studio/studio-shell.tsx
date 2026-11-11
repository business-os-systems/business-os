"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@suite/ui";
import { ArrowLeftIcon, SettingsIcon } from "@suite/ui/icons";
import { PageTree, type PageTreeCreateInput, type PageTreeRenameInput } from "@suite/website-builder/editor";
import type { CmsPageDto, CmsSiteDto } from "@/lib/api/site-client";
import { workspacePath } from "@/lib/workspace-paths";
import { StudioEditor } from "./studio-editor";

export interface StudioShellProps {
  readonly site: CmsSiteDto;
  readonly pages: readonly CmsPageDto[];
  readonly activePage: CmsPageDto;
  readonly canWrite: boolean;
  readonly userPermissions: readonly string[];
  readonly currentUserId: string;
  readonly currentUserName: string;
  readonly onSelectPage: (pageId: string) => void;
  readonly onCreatePage: (input: PageTreeCreateInput) => Promise<void>;
  readonly onRenamePage: (input: PageTreeRenameInput) => Promise<void>;
  readonly onDeletePage: (pageId: string) => Promise<void>;
}

function StudioChrome(props: { readonly site: CmsSiteDto }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-3">
        <Link
          href={workspacePath("/sites")}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <ArrowLeftIcon size={14} />
          Exit studio
        </Link>
        <span className="h-4 w-px bg-border" />
        <span className="text-xs font-semibold text-text">{props.site.title}</span>
        <span className="font-mono text-[11px] text-text-muted">{props.site.slug}</span>
        <Badge variant="tertiary" className="text-[10px]">{props.site.status}</Badge>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-text-muted">
        <SettingsIcon size={13} />
        <span>{props.site.pagesCount + " " + (props.site.pagesCount === 1 ? "page" : "pages")}</span>
      </div>
    </header>
  );
}

/** The three-region studio shell: page tree, editing canvas and inspector. */
export function StudioShell(props: StudioShellProps) {
  return (
    <div data-app="website-builder" className="flex h-screen flex-col overflow-hidden bg-background text-text">
      <StudioChrome site={props.site} />
      <div className="flex min-h-0 flex-1">
        <PageTree
          pages={props.pages}
          activePageId={props.activePage.id}
          canWrite={props.canWrite}
          onSelectPage={props.onSelectPage}
          onCreatePage={props.onCreatePage}
          onRenamePage={props.onRenamePage}
          onDeletePage={props.onDeletePage}
        />
        <StudioEditor
          site={props.site}
          page={props.activePage}
          canWrite={props.canWrite}
          userPermissions={props.userPermissions}
          currentUserId={props.currentUserId}
          currentUserName={props.currentUserName}
        />
      </div>
    </div>
  );
}
