// @vitest-environment jsdom
/* global document, HTMLElement */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PERMISSIONS } from "@suite/core";
import type {
  FinalizeUploadView,
  MediaAssetDetail,
  MediaAssetView,
  MediaClient,
} from "@suite/media/react";
import { BlockForm } from "../../src/editor/inspector/block-forms.js";
import type { BlockProps } from "../../src/editor/inspector/block-form-config.js";
import type { MediaPickerControls } from "../../src/editor/inspector/types.js";
import type { HeroBlockAst } from "../../src/ast/types.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const TIMESTAMP = "2026-01-01T00:00:00.000Z";
const LEGACY_URL = "https://legacy.example.com/old.png";

const ASSET: MediaAssetView = {
  id: "ma_picker_1",
  kind: "IMAGE",
  fileName: "edited.png",
  mimeType: "image/png",
  sizeBytes: 2048,
  checksum: "a".repeat(64),
  width: 320,
  height: 180,
  url: "https://cdn.example.com/media/edited.png",
  status: "ACTIVE",
  usageCount: 1,
  createdAt: TIMESTAMP,
};

const DETAIL: MediaAssetDetail = { ...ASSET, usages: [] };
const UPLOAD: FinalizeUploadView = {
  assetId: "ma_uploaded",
  url: "https://cdn.example.com/media/new.png",
  width: null,
  height: null,
  checksum: "b".repeat(64),
  storageBytes: 10,
  duplicate: false,
};

const HERO: HeroBlockAst = {
  id: "blk_hero",
  type: "hero",
  props: {
    headline: "Harbour views",
    imageUrl: LEGACY_URL,
  },
};

function createClient(): { readonly client: MediaClient; readonly listAssets: ReturnType<typeof vi.fn> } {
  const listAssets = vi.fn(() => Promise.resolve({ items: [ASSET], nextCursor: null }));
  const client: MediaClient = {
    listAssets,
    getAsset: vi.fn(() => Promise.resolve(DETAIL)),
    deleteAsset: vi.fn((assetId: string) =>
      Promise.resolve({ assetId, deleted: true as const })
    ),
    uploadAsset: vi.fn(() => Promise.resolve(UPLOAD)),
  };
  return { client, listAssets };
}

function controlsFor(
  client: MediaClient,
  userPermissions: readonly string[],
  onAssetSelected = vi.fn(),
  assets: MediaPickerControls["assets"] = {}
): MediaPickerControls {
  return { client, userPermissions, assets, onAssetSelected };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderForm(
  media: MediaPickerControls | null,
  onChange: (next: BlockProps) => void,
  block: HeroBlockAst = HERO
): Promise<void> {
  await act(async () => {
    root.render(<BlockForm block={block} media={media} onChange={onChange} />);
    await flush();
  });
}

function button(name: string): HTMLButtonElement | null {
  const match = Array.from(document.querySelectorAll("button")).find(
    (element) => element.textContent.trim() === name
  );
  return match instanceof HTMLButtonElement ? match : null;
}

describe("inspector media field opens the shared picker (FR-051, FR-123)", () => {
  it("stores the selected asset identity and drops the legacy URL", async () => {
    const fake = createClient();
    const onAssetSelected = vi.fn();
    const controls = controlsFor(fake.client, [PERMISSIONS.MEDIA.READ], onAssetSelected);
    const onChange = vi.fn();
    await renderForm(controls, onChange);

    const choose = button("Replace image");
    if (choose === null) {
      throw new Error("Replace image button missing.");
    }
    await act(async () => {
      choose.click();
      await flush();
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(document.body.textContent).toContain("edited.png");

    const use = button("Use asset");
    if (use === null) {
      throw new Error("Use asset button missing.");
    }
    await act(async () => {
      use.click();
      await flush();
    });

    expect(onAssetSelected).toHaveBeenCalledWith(ASSET);
    expect(onChange).toHaveBeenCalledTimes(1);
    const call = onChange.mock.calls[0];
    if (call === undefined) {
      throw new Error("The inspector did not emit the selected props.");
    }
    const next = call[0] as BlockProps;
    expect(next.image).toEqual({ kind: "asset", assetId: ASSET.id });
    expect(next.imageUrl).toBeUndefined();
    expect(JSON.stringify(next)).not.toContain("cdn.example.com");
    expect(JSON.stringify(next)).not.toContain(LEGACY_URL);
  });

  it("fails closed without media:read and never opens the library", async () => {
    const fake = createClient();
    const controls = controlsFor(fake.client, [PERMISSIONS.MEDIA.UPLOAD]);
    await renderForm(controls, vi.fn());

    expect(document.body.textContent).toContain("media:read capability");
    expect(button("Choose image")).toBeNull();
    expect(fake.listAssets).not.toHaveBeenCalled();
  });

  it("shows the picker as unavailable when the host supplies no controls", async () => {
    await renderForm(null, vi.fn());
    expect(document.body.textContent).toContain("media:read capability");
    expect(button("Choose image")).toBeNull();
  });

});

describe("inspector media preview uses the rendered alt text (FR-051)", () => {
  it("previews the resolved asset through the block alt text the renderer uses", async () => {
    const fake = createClient();
    const assets = {
      [ASSET.id]: {
        assetId: ASSET.id,
        url: ASSET.url,
        fileName: ASSET.fileName,
        width: ASSET.width,
        height: ASSET.height,
      },
    };
    const hero: HeroBlockAst = {
      id: "blk_hero",
      type: "hero",
      props: {
        headline: "Harbour views",
        image: { kind: "asset", assetId: ASSET.id },
        imageAlt: "Harbour at dawn",
      },
    };
    await renderForm(
      controlsFor(fake.client, [PERMISSIONS.MEDIA.READ], vi.fn(), assets),
      vi.fn(),
      hero
    );

    const preview = Array.from(document.querySelectorAll("img")).find(
      (image) => image.getAttribute("src") === ASSET.url
    );
    expect(preview).toBeDefined();
    expect(preview?.getAttribute("alt")).toBe("Harbour at dawn");
    expect(document.body.textContent).toContain(ASSET.fileName);
  });
});
