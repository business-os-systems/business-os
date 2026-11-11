import { describe, expect, it } from "vitest";
import {
  createController,
  createStorage,
  createTransport,
  FakeTimer,
  MINE,
  snapshot,
  storedDraft,
  THEIRS,
  tick,
} from "./autosave-fixtures.js";

describe("Editor autosave conflict resolutions (T094, T095)", () => {
  it("keeps the losing draft in history when the server rejects a stale save", async () => {
    const timer = new FakeTimer();
    const harness = createTransport([
      { kind: "conflict", current: snapshot(5, THEIRS), retainedInHistory: true },
    ]);
    const { storage } = createStorage();
    const controller = createController({ transport: harness.transport, storage, timer });

    controller.update(MINE);
    await controller.flush();
    const state = controller.getState();
    expect(state.status).toBe("conflict");
    expect(state.conflict?.mine.ast).toEqual(MINE);
    expect(state.conflict?.mine.revision).toBe(3);
    expect(state.conflict?.theirs.revision).toBe(5);
    expect(state.conflict?.retainedInHistory).toBe(true);
    expect(harness.calls).toHaveLength(1);

    timer.advance(10_000);
    await tick();
    expect(harness.calls).toHaveLength(1);
  });

  it("keep-theirs loads the server version and keeps the loser recoverable", async () => {
    const timer = new FakeTimer();
    const harness = createTransport([
      { kind: "conflict", current: snapshot(5, THEIRS), retainedInHistory: true },
    ]);
    const { storage } = createStorage();
    const controller = createController({ transport: harness.transport, storage, timer });
    controller.update(MINE);
    await controller.flush();

    controller.resolveKeepTheirs();
    expect(controller.getState().status).toBe("saved");
    expect(controller.getState().ast).toEqual(THEIRS);
    expect(controller.getState().revision).toBe(5);
    expect(controller.getState().conflict).toBeNull();
    expect(storage.read("page_1")).toBeNull();
    expect(harness.calls).toHaveLength(1);
  });

  it("keep-mine writes on top of the observed server revision", async () => {
    const timer = new FakeTimer();
    const harness = createTransport([
      { kind: "conflict", current: snapshot(5, THEIRS), retainedInHistory: true },
      { kind: "saved", snapshot: snapshot(6, MINE) },
    ]);
    const { storage } = createStorage();
    const controller = createController({ transport: harness.transport, storage, timer });
    controller.update(MINE);
    await controller.flush();

    await controller.resolveKeepMine();
    expect(harness.calls).toHaveLength(2);
    expect(harness.calls[1]?.expectedRevision).toBe(5);
    expect(harness.calls[1]?.draftAst).toEqual(MINE);
    expect(controller.getState().revision).toBe(6);
    expect(controller.getState().status).toBe("saved");
  });
});

describe("Editor offline draft recovery (T096)", () => {
  it("recovers an offline draft and never silently overwrites a newer revision", async () => {
    const timer = new FakeTimer();
    const { storage } = createStorage(storedDraft(2));
    const harness = createTransport([
      { kind: "conflict", current: snapshot(5, THEIRS), retainedInHistory: true },
    ]);
    const controller = createController({ transport: harness.transport, storage, timer });

    expect(controller.getState().status).toBe("dirty");
    expect(controller.getState().ast).toEqual(MINE);
    await controller.flush();
    expect(harness.calls[0]?.expectedRevision).toBe(2);
    expect(controller.getState().status).toBe("conflict");
  });
});
