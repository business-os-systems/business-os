import { useCallback, useEffect, useRef, useState } from "react";
import { isBrowser } from "@suite/ui";
import {
  AUTOSAVE_DEFAULTS,
  BROWSER_TIMER,
  EditorAutosaveController,
} from "./autosave-controller.js";
import type { OfflineDraftStorage } from "./offline-draft.js";
import type {
  AutosaveState,
  DraftContentTransport,
  PageContentSnapshot,
  UseEditorAutosaveReturn,
} from "./types.js";

export interface UseEditorAutosaveConfig {
  readonly pageId: string;
  readonly organizationId: string;
  readonly initial: PageContentSnapshot;
  readonly transport: DraftContentTransport;
  readonly storage: OfflineDraftStorage;
  readonly authorName: string;
}

export const AUTOSAVE_RECONNECT_EVENT = "online";

function initialState(initial: PageContentSnapshot): AutosaveState {
  return {
    status: "idle",
    ast: initial.draftAst,
    revision: initial.revision,
    media: initial.media,
    conflict: null,
    error: null,
  };
}

/**
 * React binding around the autosave controller. The controller is created once
 * per page and disposed on unmount; a browser reconnect triggers an immediate
 * retry so unsaved work resumes without a manual action (FR-028).
 */
export function useEditorAutosave(config: UseEditorAutosaveConfig): UseEditorAutosaveReturn {
  const configRef = useRef(config);
  configRef.current = config;
  const controllerRef = useRef<EditorAutosaveController | null>(null);
  const [state, setState] = useState<AutosaveState>(() => initialState(config.initial));

  const getController = useCallback((): EditorAutosaveController => {
    const existing = controllerRef.current;
    if (existing !== null) {
      return existing;
    }
    const current = configRef.current;
    const created = new EditorAutosaveController({
      pageId: current.pageId,
      organizationId: current.organizationId,
      initial: current.initial,
      transport: current.transport,
      storage: current.storage,
      authorName: current.authorName,
      debounceMs: AUTOSAVE_DEFAULTS.debounceMs,
      retryDelaysMs: AUTOSAVE_DEFAULTS.retryDelaysMs,
      timer: BROWSER_TIMER,
      now: () => new Date().toISOString(),
      onStateChange: setState,
    });
    controllerRef.current = created;
    return created;
  }, []);

  useEffect(() => {
    const controller = getController();
    setState(controller.getState());
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [getController]);

  useEffect(() => {
    if (!isBrowser) {
      return;
    }
    const handleReconnect = () => {
      void getController().retryNow();
    };
    window.addEventListener(AUTOSAVE_RECONNECT_EVENT, handleReconnect);
    return () => window.removeEventListener(AUTOSAVE_RECONNECT_EVENT, handleReconnect);
  }, [getController]);

  const updateAst = useCallback(
    (ast: AutosaveState["ast"]) => getController().update(ast),
    [getController]
  );
  const flushSave = useCallback(() => getController().flush(), [getController]);
  const resolveKeepMine = useCallback(() => getController().resolveKeepMine(), [getController]);
  const resolveKeepTheirs = useCallback(() => {
    getController().resolveKeepTheirs();
  }, [getController]);
  const retryNow = useCallback(() => getController().retryNow(), [getController]);

  return { state, updateAst, flushSave, resolveKeepMine, resolveKeepTheirs, retryNow };
}
