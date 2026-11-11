import { describe, expect, it } from "vitest";
import type { MediaAssetMap } from "../../src/ast/types.js";
import {
  createController,
  createStorage,
  createTransport,
  FakeTimer,
  MINE,
  snapshot,
  THEIRS,
  tick,
} from "./autosave-fixtures.js";

const ASSET_A = {
  assetId: "ma_autosave_a",
  url: "https://cdn.example.com/media/a.png",
  fileName: "a.png",
  width: 320,
  height: 180,
} as const;

const ASSET_B = {
  assetId: "ma_autosave_b",
  url: "https://cdn.example.com/media/b.png",
  fileName: "b.png",
  width: null,
  height: null,
} as const;

const MEDIA_A: MediaAssetMap = { [ASSET_A.assetId]: ASSET_A };
const MEDIA_B: MediaAssetMap = { [ASSET_B.assetId]: ASSET_B };

function snapshotWithMedia(
  revision: number,
  media: MediaAssetMap,
  ast = MINE
): ReturnType<typeof snapshot> {
  return { ...snapshot(revision, ast), media };
}

describe("autosave keeps the resolved media map in step with the AST (FR-051, FR-120)", () => {
  it("seeds the current map from the initial snapshot", () => {
    const timer = new FakeTimer();
    const harness = createTransport([]);
    const { storage } = createStorage();
    const controller = createController({
      transport: harness.transport,
      storage,
      timer,
      initial: snapshotWithMedia(3, MEDIA_A),
    });

    expect(controller.getState().media).toEqual(MEDIA_A);
    expect(controller.getState().ast).toEqual(MINE);
  });

  it("adopts the snapshot media returned by a successful save", async () => {
    const timer = new FakeTimer();
    const harness = createTransport([
      { kind: "saved", snapshot: snapshotWithMedia(4, MEDIA_A) },
    ]);
    const { storage } = createStorage();
    const controller = createController({ transport: harness.transport, storage, timer });

    controller.update(MINE);
    await controller.flush();

    const state = controller.getState();
    expect(state.status).toBe("saved");
    expect(state.media).toEqual(MEDIA_A);
    // The editor reads the same URL the renderer will use; no URL is stored in the AST.
    expect(JSON.stringify(state.ast)).not.toContain(ASSET_A.url);
  });

});

describe("autosave adopts the media map when a conflict is resolved (FR-051)", () => {
  it("adopts the server media when a conflict is resolved by keeping their draft", async () => {
    const timer = new FakeTimer();
    const harness = createTransport([
      {
        kind: "conflict",
        current: snapshotWithMedia(5, MEDIA_B, THEIRS),
        retainedInHistory: true,
      },
    ]);
    const { storage } = createStorage();
    const controller = createController({ transport: harness.transport, storage, timer });
    controller.update(MINE);
    await controller.flush();
    expect(controller.getState().media).toEqual({});

    controller.resolveKeepTheirs();
    expect(controller.getState().ast).toEqual(THEIRS);
    expect(controller.getState().media).toEqual(MEDIA_B);
    timer.advance(10_000);
    await tick();
    expect(controller.getState().media).toEqual(MEDIA_B);
  });

  it("keeps the local map when the author keeps their own draft", async () => {
    const timer = new FakeTimer();
    const harness = createTransport([
      {
        kind: "conflict",
        current: snapshotWithMedia(5, MEDIA_B, THEIRS),
        retainedInHistory: true,
      },
      { kind: "saved", snapshot: snapshotWithMedia(6, MEDIA_A, MINE) },
    ]);
    const { storage } = createStorage();
    const controller = createController({
      transport: harness.transport,
      storage,
      timer,
      initial: snapshotWithMedia(3, MEDIA_A),
    });
    controller.update(MINE);
    await controller.flush();

    await controller.resolveKeepMine();
    expect(controller.getState().status).toBe("saved");
    expect(controller.getState().media).toEqual(MEDIA_A);
  });
});
