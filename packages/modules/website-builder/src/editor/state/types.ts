import type { PageAst } from "../../ast/types.js";

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

export interface AutosaveConflictData {
  localAst: PageAst;
  serverAst: PageAst;
  serverRevision: number;
}

export interface AutosaveOptions {
  debounceMs?: number;
  onSaveSuccess?: (revision: number) => void;
  onConflict?: (conflict: AutosaveConflictData) => void;
  onError?: (error: Error) => void;
}

export interface UseEditorAutosaveReturn {
  status: AutosaveStatus;
  lastSavedRevision: number;
  currentAst: PageAst;
  conflictData: AutosaveConflictData | null;
  updateAst: (newAst: PageAst) => void;
  flushSave: () => Promise<void>;
  resolveConflictKeepMine: () => Promise<void>;
  resolveConflictKeepServer: () => void;
}
