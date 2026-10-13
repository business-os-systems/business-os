import { useState, useRef, useEffect, useCallback } from "react";
import type { PageAst } from "../../ast/types.js";
import type {
  AutosaveStatus,
  AutosaveConflictData,
  AutosaveOptions,
  UseEditorAutosaveReturn,
} from "./types.js";
import type { PageService } from "../../services/page-service.js";

export function useEditorAutosave(
  pageService: PageService,
  organizationId: string,
  pageId: string,
  initialAst: PageAst,
  initialRevision: number,
  options: AutosaveOptions = {}
): UseEditorAutosaveReturn {
  const {
    debounceMs = 500,
    onSaveSuccess,
    onConflict,
    onError,
  } = options;

  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [currentAst, setCurrentAst] = useState<PageAst>(initialAst);
  const [lastSavedRevision, setLastSavedRevision] = useState<number>(initialRevision);
  const [conflictData, setConflictData] = useState<AutosaveConflictData | null>(null);

  const astRef = useRef<PageAst>(currentAst);
  astRef.current = currentAst;

  const revisionRef = useRef<number>(lastSavedRevision);
  revisionRef.current = lastSavedRevision;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef<boolean>(false);

  // Perform actual CAS save against pageService
  const executeSave = useCallback(
    async (astToSave: PageAst, expectedRev: number) => {
      if (isSavingRef.current) return;
      isSavingRef.current = true;
      setStatus("saving");

      try {
        const result = await pageService.updateDraftContent({
          organizationId,
          pageId,
          expectedRevision: expectedRev,
          draftAst: astToSave as unknown as Record<string, unknown>,
        });

        if (result.success) {
          setLastSavedRevision(result.revision);
          revisionRef.current = result.revision;
          setStatus("saved");
          setConflictData(null);
          onSaveSuccess?.(result.revision);
        } else if (result.errorCode === "CMS_CONCURRENCY_CONFLICT") {
          const conflict: AutosaveConflictData = {
            localAst: astToSave,
            serverAst: result.draftAst as unknown as PageAst,
            serverRevision: result.revision,
          };
          setStatus("conflict");
          setConflictData(conflict);
          onConflict?.(conflict);
        } else {
          setStatus("error");
          onError?.(new Error(result.message ?? "Failed to autosave"));
        }
      } catch (err) {
        setStatus("error");
        onError?.(err instanceof Error ? err : new Error(String(err)));
      } finally {
        isSavingRef.current = false;
      }
    },
    [pageService, organizationId, pageId, onSaveSuccess, onConflict, onError]
  );

  // Update AST from editor interactions and schedule debounced save
  const updateAst = useCallback(
    (newAst: PageAst) => {
      setCurrentAst(newAst);
      setStatus("dirty");

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        executeSave(newAst, revisionRef.current);
      }, debounceMs);
    },
    [executeSave, debounceMs]
  );

  // Immediately flush any pending save
  const flushSave = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await executeSave(astRef.current, revisionRef.current);
  }, [executeSave]);

  // Conflict Resolution A: Keep Mine (Overwrite server using the new server revision)
  const resolveConflictKeepMine = useCallback(async () => {
    if (!conflictData) return;
    const targetRevision = conflictData.serverRevision;
    setConflictData(null);
    await executeSave(astRef.current, targetRevision);
  }, [conflictData, executeSave]);

  // Conflict Resolution B: Keep Server (Discard local draft and load server version)
  const resolveConflictKeepServer = useCallback(() => {
    if (!conflictData) return;
    setCurrentAst(conflictData.serverAst);
    setLastSavedRevision(conflictData.serverRevision);
    revisionRef.current = conflictData.serverRevision;
    setConflictData(null);
    setStatus("saved");
  }, [conflictData]);

  // Cleanup pending timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    status,
    lastSavedRevision,
    currentAst,
    conflictData,
    updateAst,
    flushSave,
    resolveConflictKeepMine,
    resolveConflictKeepServer,
  };
}
