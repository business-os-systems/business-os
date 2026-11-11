// @vitest-environment jsdom
/* global document, HTMLDivElement, HTMLButtonElement, HTMLInputElement, HTMLFormElement, HTMLElement */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import { PERMISSIONS } from "@suite/core";
import {
  MediaPicker,
  type MediaPickerProps,
} from "../src/react/media-picker.js";
import type {
  FinalizeUploadView,
  MediaAssetDetail,
  MediaAssetView,
  MediaClient,
} from "../src/react/index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const TIMESTAMP = "2026-01-01T00:00:00.000Z";
const MEDIA_READ = PERMISSIONS.MEDIA.READ;
const MEDIA_UPLOAD = PERMISSIONS.MEDIA.UPLOAD;

const ASSET: MediaAssetView = {
  id: "asset-1",
  kind: "IMAGE",
  fileName: "logo.png",
  mimeType: "image/png",
  sizeBytes: 2048,
  checksum: "a".repeat(64),
  width: 320,
  height: 180,
  url: "https://cdn.example.com/media/logo.png",
  status: "ACTIVE",
  usageCount: 1,
  createdAt: TIMESTAMP,
};

const DETAIL: MediaAssetDetail = {
  ...ASSET,
  usages: [
    {
      id: "usage-1",
      assetId: ASSET.id,
      appId: "website-builder",
      resourceType: "Page",
      resourceId: "page_home",
      subKey: "blk_hero",
      status: "PUBLISHED",
      createdAt: TIMESTAMP,
    },
  ],
};

const UPLOAD: FinalizeUploadView = {
  assetId: "asset-2",
  url: "https://cdn.example.com/media/new.png",
  width: null,
  height: null,
  checksum: "b".repeat(64),
  storageBytes: 5,
  duplicate: false,
};

const AXE_OPTIONS = {
  runOnly: {
    type: "tag" as const,
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
  },
  rules: { "color-contrast": { enabled: false } },
};

interface FakeClient {
  readonly client: MediaClient;
  readonly listAssets: ReturnType<typeof vi.fn>;
  readonly uploadAsset: ReturnType<typeof vi.fn>;
}

function createFakeClient(assets: readonly MediaAssetView[] = [ASSET]): FakeClient {
  const listAssets = vi.fn(async () => ({ items: [...assets], nextCursor: null }));
  const uploadAsset = vi.fn(async () => UPLOAD);
  const getAsset = vi.fn(async () => DETAIL);
  const deleteAsset = vi.fn(async (assetId: string) => ({
    assetId,
    deleted: true as const,
  }));
  return {
    client: { listAssets, getAsset, deleteAsset, uploadAsset },
    listAssets,
    uploadAsset,
  };
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

async function settle(): Promise<void> {
  await act(async () => {
    await flush();
  });
}

async function renderPicker(
  client: MediaClient,
  userPermissions: readonly string[],
  onSelect: MediaPickerProps["onSelect"] = () => undefined
): Promise<void> {
  await act(async () => {
    root.render(
      <MediaPicker
        client={client}
        userPermissions={userPermissions}
        isOpen
        onClose={() => undefined}
        onSelect={onSelect}
      />
    );
    await flush();
  });
}

function findButton(label: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll("button")).find(
    (button) =>
      (button.textContent ?? "").trim() === label ||
      button.getAttribute("aria-label") === label
  );
  if (!(match instanceof HTMLButtonElement)) {
    throw new Error(`Button "${label}" was not rendered.`);
  }
  return match;
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
    await flush();
  });
}

async function setInputValue(input: HTMLInputElement, value: string): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  );
  if (descriptor?.set === undefined) {
    throw new Error("The test environment has no input value setter.");
  }
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      input,
      value
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
  });
}

async function submitForm(form: HTMLFormElement): Promise<void> {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
  });
}

async function selectFile(input: HTMLInputElement, file: File): Promise<void> {
  Object.defineProperty(input, "files", {
    value: [file],
    configurable: true,
  });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
  });
}

  it("fails closed and never loads assets without media:read", async () => {
    const fake = createFakeClient();
    await renderPicker(fake.client, []);

    expect(document.body.textContent).toContain("Media access denied");
    expect(fake.listAssets).not.toHaveBeenCalled();
  });

  it("searches the shared library by file name", async () => {
    const fake = createFakeClient();
    await renderPicker(fake.client, [MEDIA_READ]);
    expect(fake.listAssets).toHaveBeenCalledWith({ limit: 24 });

    const search = document.querySelector<HTMLInputElement>("input[type=search]");
    if (search === null) throw new Error("Search input missing.");
    const form = search.form;
    if (form === null) throw new Error("Search form missing.");
    await setInputValue(search, "logo");
    await submitForm(form);

    expect(fake.listAssets).toHaveBeenLastCalledWith({
      limit: 24,
      search: "logo",
    });
    expect(document.body.textContent).toContain("logo.png");
  });

  it("returns the selected asset to the host application", async () => {
    const fake = createFakeClient();
    const onSelect = vi.fn();
    await renderPicker(fake.client, [MEDIA_READ], onSelect);

    await click(findButton("Use logo.png"));

    expect(onSelect).toHaveBeenCalledWith(ASSET);
  });

  it("surfaces every referencing location from the picker", async () => {
    const fake = createFakeClient();
    await renderPicker(fake.client, [MEDIA_READ]);

    await click(findButton("View usage for logo.png"));
    await settle();

    expect(document.body.textContent).toContain(
      "website-builder · Page page_home · blk_hero · PUBLISHED"
    );
  });

  it("hides upload without media:upload and shows it with the capability", async () => {
    const readOnly = createFakeClient();
    await renderPicker(readOnly.client, [MEDIA_READ]);
    expect(
      Array.from(document.querySelectorAll("button")).some(
        (button) => (button.textContent ?? "").trim() === "Upload"
      )
    ).toBe(false);

    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    const uploader = createFakeClient();
    await renderPicker(uploader.client, [MEDIA_READ, MEDIA_UPLOAD]);
    expect(
      Array.from(document.querySelectorAll("button")).some(
        (button) => (button.textContent ?? "").trim() === "Upload"
      )
    ).toBe(true);
  });

  it("uploads from the picker and reloads the library", async () => {
    const fake = createFakeClient();
    await renderPicker(fake.client, [MEDIA_READ, MEDIA_UPLOAD]);
    await click(findButton("Upload"));

    const fileInput = document.querySelector<HTMLInputElement>("input[type=file]");
    if (fileInput === null) throw new Error("File input missing.");
    const label = fileInput.closest("label");
    expect(label?.textContent).toContain("Choose image");
    expect(label?.textContent).toContain("Accepted types: image/jpeg");
    const file = new File(["hello"], "new.png", { type: "image/png" });
    await selectFile(fileInput, file);

    const uploadButton = Array.from(document.querySelectorAll("button")).find(
      (button) => (button.textContent ?? "").trim() === "Upload image"
    );
    if (!(uploadButton instanceof HTMLButtonElement)) {
      throw new Error("Upload submit button missing.");
    }
    await click(uploadButton);
    await settle();

    expect(fake.uploadAsset).toHaveBeenCalledWith(file);
    expect(fake.listAssets.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("is app-agnostic: the source imports no application or Next.js module", () => {
    const source = readFileSync(
      join(process.cwd(), "src/react/media-picker.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/from ["']next\//);
    expect(source).not.toMatch(/from ["']@\//);
    expect(source).not.toMatch(/from ["']apps\//);
    expect(source).not.toMatch(/@suite\/db/);
  });

  it("names the picker dialog with its title and description", async () => {
    const fake = createFakeClient();
    await renderPicker(fake.client, [MEDIA_READ]);

    const dialog = document.querySelector('[role="dialog"]');
    if (!(dialog instanceof HTMLElement)) {
      throw new Error("Picker dialog did not open.");
    }
    const titleId = dialog.getAttribute("aria-labelledby");
    expect(document.getElementById(titleId ?? "")?.textContent).toBe("Choose media");
    const descriptionId = dialog.getAttribute("aria-describedby");
    expect(
      document.getElementById(descriptionId ?? "")?.textContent
    ).toContain("Search the shared workspace library");
  });

  it("has no WCAG A/AA violations and stays keyboard reachable", async () => {
    const fake = createFakeClient();
    await renderPicker(fake.client, [MEDIA_READ, MEDIA_UPLOAD]);

    const results = await axe.run(document.body, AXE_OPTIONS);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);

    const focusable = document.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]'
    );
    expect(focusable.length).toBeGreaterThan(0);
    for (const element of focusable) {
      expect(element.getAttribute("tabindex")).not.toBe("-1");
    }
  });
