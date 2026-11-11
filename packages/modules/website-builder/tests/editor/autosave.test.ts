import { describe, expect, it } from "vitest";
import { createController, createStorage, createTransport, FakeTimer, MINE, snapshot, tick } from "./autosave-fixtures.js";

describe("Editor autosave debounce and retry (T069)", () => {
  it("debounces edits and sends the base revision on save", async () => {
    const timer = new FakeTimer();
    const harness = createTransport([{ kind: "saved", snapshot: snapshot(4, MINE) }]);
    const { storage } = createStorage();
    const controller = createController({ transport: harness.transport, storage, timer });

    controller.update(MINE);
    expect(harness.calls).toHaveLength(0);
    expect(controller.getState().status).toBe("dirty");

    timer.advance(799);
    await tick();
    expect(harness.calls).toHaveLength(0);

    timer.advance(1);
    await tick();
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.expectedRevision).toBe(3);
    expect(controller.getState().status).toBe("saved");
    expect(controller.getState().revision).toBe(4);
    expect(storage.read("page_1")).toBeNull();
  });

  it("retries a failed save with backoff and reports the offline state", async () => {
    const timer = new FakeTimer();
    const statuses: string[] = [];
    const harness = createTransport([
      new Error("Connection refused"),
      { kind: "saved", snapshot: snapshot(4, MINE) },
    ]);
    const { storage } = createStorage();
    const controller = createController({ transport: harness.transport, storage, timer, statuses });

    controller.update(MINE);
    timer.advance(800);
    await tick();
    expect(harness.calls).toHaveLength(1);
    expect(controller.getState().status).toBe("offline");
    expect(controller.getState().error).toContain("Connection refused");

    timer.advance(1_000);
    await tick();
    expect(harness.calls).toHaveLength(2);
    expect(controller.getState().status).toBe("saved");
    expect(statuses).toContain("offline");
  });
});
