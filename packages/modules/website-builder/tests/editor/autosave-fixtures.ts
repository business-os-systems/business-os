import {
  EditorAutosaveController,
  type TimerScheduler,
} from "../../src/editor/state/autosave-controller.js";
import {
  buildOfflineDraft,
  createOfflineDraftStorage,
  type KeyValueStorage,
  type OfflineDraft,
  type OfflineDraftStorage,
} from "../../src/editor/state/offline-draft.js";
import type {
  DraftContentTransport,
  DraftSaveInput,
  DraftSaveResult,
  PageContentSnapshot,
} from "../../src/editor/state/types.js";
import type { PageAst } from "../../src/ast/types.js";

export const EMPTY: PageAst = { version: 1, schemaVersion: "2026-03", sections: [] };
export const MINE: PageAst = {
  version: 1,
  schemaVersion: "2026-03",
  sections: [{ id: "sec_mine", blocks: [{ id: "blk_mine", type: "hero", props: { headline: "Mine" } }] }],
};
export const THEIRS: PageAst = {
  version: 1,
  schemaVersion: "2026-03",
  sections: [{ id: "sec_theirs", blocks: [{ id: "blk_theirs", type: "hero", props: { headline: "Theirs" } }] }],
};

export function snapshot(revision: number, draftAst: PageAst = EMPTY): PageContentSnapshot {
  return {
    pageId: "page_1",
    revision,
    draftAst,
    publishedAst: null,
    media: {},
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastEditedByUserId: "usr_other",
    lastEditedAt: "2026-01-01T00:00:00.000Z",
  };
}

export class FakeTimer implements TimerScheduler {
  private sequence = 0;
  private now = 0;
  private readonly callbacks = new Map<number, { readonly run: () => void; readonly at: number }>();

  set(callback: () => void, delayMs: number): number {
    this.sequence += 1;
    this.callbacks.set(this.sequence, { run: callback, at: this.now + delayMs });
    return this.sequence;
  }

  clear(handle: number): void {
    this.callbacks.delete(handle);
  }

  advance(delayMs: number): void {
    this.now += delayMs;
    for (const [handle, entry] of [...this.callbacks.entries()]) {
      if (entry.at <= this.now) {
        this.callbacks.delete(handle);
        entry.run();
      }
    }
  }
}

export interface TransportHarness {
  readonly transport: DraftContentTransport;
  readonly calls: DraftSaveInput[];
}

export function createTransport(results: readonly (DraftSaveResult | Error)[]): TransportHarness {
  const calls: DraftSaveInput[] = [];
  const queue = [...results];
  return {
    calls,
    transport: {
      saveDraft(input) {
        calls.push(input);
        const next = queue.shift();
        if (next === undefined) {
          return Promise.reject(new Error("Unexpected save"));
        }
        return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
      },
    },
  };
}

export interface StorageHarness {
  readonly storage: OfflineDraftStorage;
  readonly raw: KeyValueStorage;
}

export function createStorage(initial?: OfflineDraft): StorageHarness {
  const values = new Map<string, string>();
  if (initial !== undefined) {
    values.set("business-os:website-builder:draft:org_1:page_1", JSON.stringify(initial));
  }
  const raw: KeyValueStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
  return { storage: createOfflineDraftStorage(raw, "org_1"), raw };
}

export function createController(input: {
  readonly transport: DraftContentTransport;
  readonly storage: OfflineDraftStorage;
  readonly timer: FakeTimer;
  readonly statuses?: string[];
  readonly initial?: PageContentSnapshot;
}): EditorAutosaveController {
  let tickCount = 0;
  return new EditorAutosaveController({
    pageId: "page_1",
    organizationId: "org_1",
    initial: input.initial ?? snapshot(3),
    transport: input.transport,
    storage: input.storage,
    authorName: "Rohit",
    debounceMs: 800,
    retryDelaysMs: [1_000, 3_000],
    timer: input.timer,
    now: () => {
      tickCount += 1;
      return new Date(Date.UTC(2026, 0, 1, 0, 0, tickCount)).toISOString();
    },
    onStateChange: (state) => input.statuses?.push(state.status),
  });
}

export function storedDraft(baseRevision: number): OfflineDraft {
  return buildOfflineDraft({
    organizationId: "org_1",
    pageId: "page_1",
    baseRevision,
    savedAt: "2026-01-01T00:00:00.000Z",
    draftAst: MINE,
  });
}

export async function tick(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
