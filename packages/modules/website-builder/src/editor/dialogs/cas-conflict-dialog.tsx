import React from "react";
import { Button } from "@suite/ui";
import { AlertTriangleIcon } from "@suite/ui/icons";
import type { AutosaveConflict } from "../state/types.js";

export interface CasConflictDialogProps {
  readonly conflict: AutosaveConflict | null;
  readonly currentUserId: string;
  readonly currentUserName: string;
  readonly timeZone: string;
  readonly locale: string;
  readonly onKeepMine: () => void;
  readonly onKeepTheirs: () => void;
}

type VersionSide = "mine" | "theirs";

const VERSION_CARD_CLASSES = {
  mine: "border-action bg-action-tint",
  theirs: "border-border bg-surface-muted",
} as const satisfies Record<VersionSide, string>;

function formatVersionTime(input: { readonly iso: string; readonly locale: string; readonly timeZone: string }): string {
  const date = new Date(input.iso);
  if (Number.isNaN(date.getTime())) {
    return input.iso;
  }
  return new Intl.DateTimeFormat(input.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: input.timeZone,
  }).format(date);
}

function theirsAuthorName(input: {
  readonly conflict: AutosaveConflict;
  readonly currentUserId: string;
  readonly currentUserName: string;
}): string {
  const authorId = input.conflict.theirs.lastEditedByUserId;
  return authorId === input.currentUserId ? input.currentUserName : "Another editor";
}

function ConflictHeader() {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-fill text-warning-text">
        <AlertTriangleIcon size={16} />
      </span>
      <div>
        <h2 id="cas-conflict-title" className="text-sm font-bold text-text">
          A newer version of this page was saved
        </h2>
        <p id="cas-conflict-description" className="mt-1 text-xs text-text-secondary">
          Saving now would overwrite that version, so the save was refused. Choose which version to keep.
        </p>
      </div>
    </div>
  );
}

function RetentionNote(props: { readonly retainedInHistory: boolean }) {
  if (!props.retainedInHistory) {
    return null;
  }
  return (
    <p className="rounded-md border border-border bg-surface-muted p-2 text-[11px] text-text-secondary">
      Your version was kept in this page's version history before the conflict was reported, so keeping their version
      does not discard it.
    </p>
  );
}

function VersionCard(props: {
  readonly side: VersionSide;
  readonly title: string;
  readonly authorName: string;
  readonly revision: number;
  readonly editedAt: string;
  readonly sectionCount: number;
  readonly locale: string;
  readonly timeZone: string;
  readonly actionLabel: string;
  readonly onAction: () => void;
}) {
  const time = formatVersionTime({ iso: props.editedAt, locale: props.locale, timeZone: props.timeZone });
  return (
    <div className={"flex flex-col gap-2 rounded-lg border p-3 " + VERSION_CARD_CLASSES[props.side]}>
      <div>
        <p className="text-xs font-semibold text-text">{props.title}</p>
        <p className="text-[11px] text-text-secondary">{`${props.authorName} · revision ${props.revision}`}</p>
        <p className="text-[11px] text-text-muted">
          {`${time} · ${props.sectionCount} ${props.sectionCount === 1 ? "section" : "sections"}`}
        </p>
      </div>
      <Button type="button" size="sm" variant={props.side === "mine" ? "default" : "outline"} onClick={props.onAction}>
        {props.actionLabel}
      </Button>
    </div>
  );
}

/**
 * Names both competing drafts (author, revision and edit time) and offers the two
 * resolutions from FR-027. The losing draft is already in version history, so
 * neither button destroys work.
 */
export function CasConflictDialog(props: CasConflictDialogProps) {
  const conflict = props.conflict;
  if (conflict === null) {
    return null;
  }
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="cas-conflict-title"
      aria-describedby="cas-conflict-description"
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6"
    >
      <div className="flex w-full max-w-2xl flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-lg">
        <ConflictHeader />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <VersionCard
            side="mine"
            title="Your version"
            authorName={conflict.mine.authorName}
            revision={conflict.mine.revision}
            editedAt={conflict.mine.editedAt}
            sectionCount={conflict.mine.ast.sections.length}
            locale={props.locale}
            timeZone={props.timeZone}
            actionLabel="Keep my version"
            onAction={props.onKeepMine}
          />
          <VersionCard
            side="theirs"
            title="Saved version"
            authorName={theirsAuthorName({
              conflict,
              currentUserId: props.currentUserId,
              currentUserName: props.currentUserName,
            })}
            revision={conflict.theirs.revision}
            editedAt={conflict.theirs.lastEditedAt ?? conflict.theirs.updatedAt}
            sectionCount={conflict.theirs.draftAst.sections.length}
            locale={props.locale}
            timeZone={props.timeZone}
            actionLabel="Keep their version"
            onAction={props.onKeepTheirs}
          />
        </div>
        <RetentionNote retainedInHistory={conflict.retainedInHistory} />
        <p className="text-[11px] text-text-muted">
          Keeping your version saves it on top of revision {conflict.theirs.revision} and becomes the new draft.
        </p>
      </div>
    </div>
  );
}
