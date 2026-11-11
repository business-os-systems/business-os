// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import axe from "axe-core";
import { PERMISSIONS } from "@suite/core";
import { MediaApiError, type MediaAssetDetail, type MediaAssetView, type MediaClient } from "@suite/media/react";
import { baseNavigationConfig } from "../src/components/layout/navigation.config";
import { SidebarNav } from "../src/components/layout/sidebar-nav";
import MediaPage from "../src/app/(dashboard)/media/page";
import { MediaLibraryClient } from "../src/app/(dashboard)/media/media-library-client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const authState = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock("@/lib/auth-guard", () => ({
  requireAuth: () => Promise.resolve({ permissions: authState.permissions }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/media",
}));

const TIMESTAMP = "2026-01-01T00:00:00.000Z";

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

const UNUSED_ASSET: MediaAssetView = {
  ...ASSET,
  id: "asset-2",
  fileName: "brand-logo.png",
  usageCount: 0,
};

const DETAIL: MediaAssetDetail = {
  ...ASSET,
  usages: [
    {
      id: "usage-1",
      assetId: ASSET.id,
      appId: "website-builder",
      resourceType: "page",
      resourceId: "home",
      subKey: "hero",
      status: "PUBLISHED",
      createdAt: TIMESTAMP,
    },
  ],
};

const DELETE_REFUSAL = new MediaApiError({
  status: 409,
  code: "MEDIA_IN_USE",
  title: "Media Asset Is In Use",
  detail: "This asset is referenced by published content at 1 location(s).",
  invalidParams: [{ name: "website-builder:page", reason: "home#hero" }],
});

const DELETE_ASSET_LABEL = "Delete asset";
const DIALOG_SELECTOR = '[role="dialog"]';

const MEDIA_READ = PERMISSIONS.MEDIA.READ;
const MEDIA_UPLOAD = PERMISSIONS.MEDIA.UPLOAD;
const MEDIA_DELETE = PERMISSIONS.MEDIA.DELETE;
const ALL_PERMISSIONS = [MEDIA_READ, MEDIA_UPLOAD, MEDIA_DELETE];

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
  readonly getAsset: ReturnType<typeof vi.fn>;
  readonly uploadAsset: ReturnType<typeof vi.fn>;
  readonly deleteAsset: ReturnType<typeof vi.fn>;
}

function createFakeClient(): FakeClient {
  const listAssets = vi.fn((query?: { search?: string }) => Promise.resolve({
    items: query?.search === "brand" ? [UNUSED_ASSET] : [ASSET, UNUSED_ASSET],
    nextCursor: null,
  }));
  const getAsset = vi.fn(() => Promise.resolve(DETAIL));
  const uploadAsset = vi.fn(() => Promise.resolve({
    assetId: "asset-3",
    url: "https://cdn.example.com/media/new.png",
    width: null,
    height: null,
    checksum: "b".repeat(64),
    storageBytes: 5,
    duplicate: false,
  }));
  const deleteAsset = vi.fn((assetId: string) =>
    Promise.resolve({ assetId, deleted: true as const })
  );
  return {
    client: { listAssets, getAsset, uploadAsset, deleteAsset },
    listAssets,
    getAsset,
    uploadAsset,
    deleteAsset,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  authState.permissions = [];
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

async function renderLibrary(
  client: MediaClient,
  permissions: readonly string[]
): Promise<void> {
  await act(async () => {
    root.render(
      <MediaLibraryClient client={client} userPermissions={permissions} />
    );
    await flush();
  });
}

function findButton(label: string, scope: ParentNode = document): HTMLButtonElement {
  const match = Array.from(scope.querySelectorAll("button")).find(
    (button) => button.textContent.trim() === label
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

  it("denies the page when media:read is missing", async () => {
    const html = renderToString(await MediaPage());
    expect(html).toContain("Media access denied");
    expect(html).not.toContain("Media library");
  });

  it("renders the library for a reader", async () => {
    authState.permissions = [MEDIA_READ];
    const html = renderToString(await MediaPage());
    expect(html).toContain("Media library");
  });

  it("lists assets with previews and usage counts", async () => {
    const fake = createFakeClient();
    await renderLibrary(fake.client, ALL_PERMISSIONS);

    expect(document.body.textContent).toContain("logo.png");
    expect(document.body.textContent).toContain("brand-logo.png");
    expect(document.body.textContent).toContain("1 location");
    expect(document.body.textContent).toContain("Unused");
    expect(document.querySelector('img[alt="logo.png"]')).not.toBeNull();
  });

  it("submits the search filter to the typed API client", async () => {
    const fake = createFakeClient();
    await renderLibrary(fake.client, [MEDIA_READ]);

    const search = document.querySelector<HTMLInputElement>("input[type=search]");
    if (search === null) throw new Error("Search input missing.");
    const form = search.form;
    if (form === null) throw new Error("Search form missing.");
    await setInputValue(search, "brand");
    await submitForm(form);

    expect(fake.listAssets).toHaveBeenLastCalledWith({ limit: 24, search: "brand" });
    expect(document.body.textContent).toContain("brand-logo.png");
  });

  it("sends the type and unused filters to the typed API client", async () => {
    const fake = createFakeClient();
    await renderLibrary(fake.client, [MEDIA_READ]);

    const typeTrigger = document.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="listbox"]'
    );
    if (typeTrigger === null) throw new Error("Type filter trigger missing.");
    await click(typeTrigger);
    const imageOption = Array.from(
      document.querySelectorAll<HTMLElement>('[role="option"]')
    ).find((option) => option.textContent.trim() === "Images");
    if (imageOption === undefined) throw new Error("Image filter option missing.");
    await click(imageOption);

    const unusedToggle = document.querySelector<HTMLInputElement>(
      'input[type="checkbox"]'
    );
    if (unusedToggle === null) throw new Error("Unused filter missing.");
    await click(unusedToggle);

    expect(fake.listAssets).toHaveBeenLastCalledWith({
      limit: 24,
      type: "IMAGE",
      unused: true,
    });
  });

  it("deletes from the table only after the confirmation dialog", async () => {
    const fake = createFakeClient();
    await renderLibrary(fake.client, [MEDIA_READ, MEDIA_DELETE]);

    await click(findButton(DELETE_ASSET_LABEL));
    expect(fake.deleteAsset).not.toHaveBeenCalled();

    const dialog = document.querySelector(DIALOG_SELECTOR);
    if (!(dialog instanceof HTMLElement)) {
      throw new Error("Delete confirmation did not open.");
    }
    await click(findButton(DELETE_ASSET_LABEL, dialog));

    expect(fake.deleteAsset).toHaveBeenCalledWith("asset-1");
    expect(document.body.textContent).toContain("Deleted logo.png.");
  });

  it("uploads an image and refreshes the library", async () => {
    const fake = createFakeClient();
    await renderLibrary(fake.client, [MEDIA_READ, MEDIA_UPLOAD]);
    await click(findButton("Upload image"));

    const fileInput = document.querySelector<HTMLInputElement>("input[type=file]");
    if (fileInput === null) throw new Error("File input missing.");
    const file = new File(["hello"], "new.png", { type: "image/png" });
    await selectFile(fileInput, file);
    const dialog = document.querySelector(DIALOG_SELECTOR);
    if (!(dialog instanceof HTMLElement)) {
      throw new Error("Upload dialog did not open.");
    }
    await click(findButton("Upload image", dialog));

    expect(fake.uploadAsset).toHaveBeenCalledWith(file);
    expect(document.body.textContent).toContain("Image uploaded to the shared library.");
    expect(fake.listAssets.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("hides upload and delete actions without their capabilities", async () => {
    const fake = createFakeClient();
    await renderLibrary(fake.client, [MEDIA_READ]);

    expect(
      Array.from(document.querySelectorAll("button")).some(
        (button) => button.textContent.trim() === "Upload image"
      )
    ).toBe(false);
    expect(document.body.textContent).not.toContain(DELETE_ASSET_LABEL);
  });

  it("refuses to render the library at all without media:read", async () => {
    const fake = createFakeClient();
    await renderLibrary(fake.client, []);

    expect(document.body.textContent).toContain("Media access denied");
    expect(fake.listAssets).not.toHaveBeenCalled();
  });

  it("shows usage locations and surfaces the API reference list on delete refusal", async () => {
    const fake = createFakeClient();
    fake.deleteAsset.mockRejectedValue(DELETE_REFUSAL);
    await renderLibrary(fake.client, [MEDIA_READ, MEDIA_DELETE]);

    await click(findButton("Inspect asset"));
    expect(fake.getAsset).toHaveBeenCalledWith("asset-1");
    expect(document.body.textContent).toContain("Usage locations");
    expect(document.body.textContent).toContain("website-builder / page");
    expect(document.body.textContent).toContain("home#hero");
    expect(document.body.textContent).toContain("Published");

    const dialog = document.querySelector(DIALOG_SELECTOR);
    if (dialog === null) throw new Error("Detail dialog did not open.");
    await click(findButton(DELETE_ASSET_LABEL, dialog));
    expect(fake.deleteAsset).not.toHaveBeenCalled();

    const confirmation = document.querySelector(DIALOG_SELECTOR);
    if (confirmation === null) throw new Error("Delete confirmation did not open.");
    await click(findButton(DELETE_ASSET_LABEL, confirmation));

    expect(fake.deleteAsset).toHaveBeenCalledWith("asset-1");
    expect(document.body.textContent).toContain("Asset could not be deleted");
    expect(document.body.textContent).toContain("website-builder:page: home#hero");
  });

  it("adds Media as a capability-gated platform core anchor", () => {
    const mediaItem = baseNavigationConfig.topItems.find(
      (item) => item.id === "media"
    );
    expect(mediaItem).toMatchObject({
      href: "/media",
      icon: "media",
      permission: MEDIA_READ,
    });
    expect(
      renderToString(
        <SidebarNav config={baseNavigationConfig} userPermissions={[MEDIA_READ]} />
      )
    ).toContain("Media");
    expect(
      renderToString(<SidebarNav config={baseNavigationConfig} userPermissions={[]} />)
    ).not.toContain('href="/media"');
  });

  it("has no WCAG A/AA violations and stays keyboard reachable", async () => {
    const fake = createFakeClient();
    await renderLibrary(fake.client, ALL_PERMISSIONS);

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
