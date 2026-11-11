import type { PageAst } from "../../ast/types.js";
import { buildOfflineDraft, recoverOfflineDraft, type OfflineDraftStorage } from "./offline-draft.js";
import type {
  AutosaveConflict,
  AutosaveState,
  DraftContentTransport,
  DraftSaveResult,
  PageContentSnapshot,
} from "./types.js";

export const AUTOSAVE_DEFAULTS = {
  debounceMs: 800,
  retryDelaysMs: [1_000, 3_000, 8_000],
} as const;

export interface TimerScheduler {
  set(callback: () => void, delayMs: number): number;
  clear(handle: number): void;
}

export const BROWSER_TIMER: TimerScheduler = {
  set: (callback, delayMs) => globalThis.setTimeout(callback, delayMs) as unknown as number,
  clear: (handle) => globalThis.clearTimeout(handle),
};

export interface AutosaveControllerConfig {
  readonly pageId: string;
  readonly organizationId: string;
  readonly initial: PageContentSnapshot;
  readonly transport: DraftContentTransport;
  readonly storage: OfflineDraftStorage;
  readonly authorName: string;
  readonly debounceMs: number;
  readonly retryDelaysMs: readonly number[];
  readonly timer: TimerScheduler;
  readonly now: () => string;
  readonly onStateChange: (state: AutosaveState) => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function initialAst(config: AutosaveControllerConfig): { ast: PageAst; baseRevision: number; status: AutosaveState["status"] } {
  const recovery = recoverOfflineDraft(config.storage, config.pageId);
  if (recovery.kind === "recovered") {
    return { ast: recovery.draft.draftAst, baseRevision: recovery.draft.baseRevision, status: "dirty" };
  }
  return { ast: config.initial.draftAst, baseRevision: config.initial.revision, status: "idle" };
}

/**
 * Owns the debounced, revision-checked save loop. Every request carries the
 * revision the pending draft was derived from, so the server can reject a stale
 * write instead of overwriting newer content (FR-026, FR-027, CT-3).
 */
export class EditorAutosaveController {
  private readonly config: AutosaveControllerConfig;
  private state: AutosaveState;
  private baseRevision: number;
  private timerHandle: number | null = null;
  private inFlight = false;
  private queued = false;
  private retryAttempt = 0;
  private disposed = false;

  constructor(config: AutosaveControllerConfig) {
    this.config = config;
    const start = initialAst(config);
    this.baseRevision = start.baseRevision;
    this.state = {
      status: start.status,
      ast: start.ast,
      revision: config.initial.revision,
      media: config.initial.media,
      conflict: null,
      error: null,
    };
    config.onStateChange(this.state);
    if (start.status === "dirty") {
      this.schedule();
    }
  }

  getState(): AutosaveState {
    return this.state;
  }

  update(ast: PageAst): void {
    if (this.disposed || this.state.conflict !== null) {
      return;
    }
    this.state = { ...this.state, status: "dirty", ast, error: null };
    this.persist(ast);
    this.emit();
    this.schedule();
  }

  async flush(): Promise<void> {
    if (this.disposed || this.state.conflict !== null) {
      return;
    }
    if (this.inFlight) {
      this.queued = true;
      return;
    }
    this.cancelTimer();
    this.inFlight = true;
    this.setState({ status: "saving", error: null });
    try {
      const result = await this.config.transport.saveDraft({
        expectedRevision: this.baseRevision,
        draftAst: this.state.ast,
      });
      this.applyResult(result);
    } catch (error: unknown) {
      this.applyFailure(error);
    } finally {
      this.inFlight = false;
      this.drainQueue();
    }
  }

  async retryNow(): Promise<void> {
    if (this.state.status === "conflict") {
      return;
    }
    this.retryAttempt = 0;
    await this.flush();
  }

  async resolveKeepMine(): Promise<void> {
    const conflict = this.state.conflict;
    if (conflict === null) {
      return;
    }
    this.baseRevision = conflict.theirs.revision;
    this.state = {
      status: "dirty",
      ast: this.state.ast,
      revision: conflict.theirs.revision,
      media: this.state.media,
      conflict: null,
      error: null,
    };
    this.persist(this.state.ast);
    this.emit();
    await this.flush();
  }

  resolveKeepTheirs(): void {
    const conflict = this.state.conflict;
    if (conflict === null) {
      return;
    }
    this.baseRevision = conflict.theirs.revision;
    this.state = {
      status: "saved",
      ast: conflict.theirs.draftAst,
      revision: conflict.theirs.revision,
      media: conflict.theirs.media,
      conflict: null,
      error: null,
    };
    this.retryAttempt = 0;
    this.config.storage.clear(this.config.pageId);
    this.emit();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelTimer();
  }

  private applyResult(result: DraftSaveResult): void {
    if (result.kind === "saved") {
      this.applySaved(result.snapshot);
      return;
    }
    this.applyConflict(result.current, result.retainedInHistory);
  }

  private applySaved(snapshot: PageContentSnapshot): void {
    this.baseRevision = snapshot.revision;
    this.retryAttempt = 0;
    this.state = {
      status: "saved",
      ast: snapshot.draftAst,
      revision: snapshot.revision,
      media: snapshot.media,
      conflict: null,
      error: null,
    };
    this.config.storage.clear(this.config.pageId);
    this.emit();
  }

  private applyConflict(current: PageContentSnapshot, retainedInHistory: boolean): void {
    const conflict: AutosaveConflict = {
      mine: {
        ast: this.state.ast,
        authorName: this.config.authorName,
        editedAt: this.config.now(),
        revision: this.baseRevision,
      },
      theirs: current,
      retainedInHistory,
    };
    this.state = { ...this.state, status: "conflict", conflict, error: null };
    this.emit();
  }

  private applyFailure(error: unknown): void {
    const message = messageOf(error);
    const delay = this.config.retryDelaysMs[this.retryAttempt];
    if (delay === undefined) {
      this.state = { ...this.state, status: "error", error: message };
      this.emit();
      return;
    }
    this.retryAttempt += 1;
    this.state = { ...this.state, status: "offline", error: message };
    this.emit();
    this.cancelTimer();
    this.timerHandle = this.config.timer.set(() => {
      this.timerHandle = null;
      void this.flush();
    }, delay);
  }

  private persist(ast: PageAst): void {
    this.config.storage.write(
      buildOfflineDraft({
        organizationId: this.config.organizationId,
        pageId: this.config.pageId,
        baseRevision: this.baseRevision,
        savedAt: this.config.now(),
        draftAst: ast,
      })
    );
  }

  private schedule(): void {
    this.cancelTimer();
    this.timerHandle = this.config.timer.set(() => {
      this.timerHandle = null;
      void this.flush();
    }, this.config.debounceMs);
  }

  private cancelTimer(): void {
    if (this.timerHandle !== null) {
      this.config.timer.clear(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private drainQueue(): void {
    if (!this.queued) {
      return;
    }
    this.queued = false;
    if (this.state.status === "dirty" || this.state.status === "offline") {
      this.schedule();
    }
  }

  private setState(patch: Partial<AutosaveState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit(): void {
    this.config.onStateChange(this.state);
  }
}
