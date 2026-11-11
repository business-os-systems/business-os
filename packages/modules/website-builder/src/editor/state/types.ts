import type { MediaAssetMap, PageAst } from "../../ast/types.js";

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "offline" | "conflict" | "error";

/** The tenant-scoped page content contract, shared by the API and the editor. */
export interface PageContentSnapshot {
  readonly pageId: string;
  readonly revision: number;
  readonly draftAst: PageAst;
  readonly publishedAst: PageAst | null;
  /** Server-resolved asset URLs for the loaded draft and published AST. */
  readonly media: MediaAssetMap;
  readonly updatedAt: string;
  readonly lastEditedByUserId: string | null;
  readonly lastEditedAt: string | null;
}

export interface DraftSaveInput {
  readonly expectedRevision: number;
  readonly draftAst: PageAst;
}

export type DraftSaveResult =
  | { readonly kind: "saved"; readonly snapshot: PageContentSnapshot }
  | {
      readonly kind: "conflict";
      readonly current: PageContentSnapshot;
      readonly retainedInHistory: boolean;
    };

export interface DraftContentTransport {
  saveDraft(input: DraftSaveInput): Promise<DraftSaveResult>;
}

export interface LocalDraftVersion {
  readonly ast: PageAst;
  readonly authorName: string;
  readonly editedAt: string;
  readonly revision: number;
}

export interface AutosaveConflict {
  readonly mine: LocalDraftVersion;
  readonly theirs: PageContentSnapshot;
  readonly retainedInHistory: boolean;
}

export interface AutosaveState {
  readonly status: AutosaveStatus;
  readonly ast: PageAst;
  readonly revision: number;
  /** Server-resolved asset URLs for the current AST; replaced with each adopted snapshot. */
  readonly media: MediaAssetMap;
  readonly conflict: AutosaveConflict | null;
  readonly error: string | null;
}

export interface UseEditorAutosaveReturn {
  readonly state: AutosaveState;
  readonly updateAst: (ast: PageAst) => void;
  readonly flushSave: () => Promise<void>;
  readonly resolveKeepMine: () => Promise<void>;
  readonly resolveKeepTheirs: () => void;
  readonly retryNow: () => Promise<void>;
}
