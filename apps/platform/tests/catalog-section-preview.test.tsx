// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DEFAULT_APPEARANCE_TOKENS } from "@suite/website-builder/appearance";
import { createCatalogDraft } from "../src/lib/catalog-schema";
import {
  CATALOG_PREVIEW_WIDTH_IDS,
  CatalogPreviewFrame,
  CatalogPreviewWidthControl,
} from "../src/components/catalog/catalog-preview-frame";
import { CatalogDiscardDialog } from "../src/components/catalog/catalog-discard-dialog";
import { CatalogEditorSectionPane } from "../src/components/catalog/catalog-editor-section-pane";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../src/components/catalog/use-catalog-preview-theme", () => ({
  useCatalogPreviewTheme: () => ({
    options: [{ id: "theme-1", name: "Coastal Linen" }],
    tokensFor: () => DEFAULT_APPEARANCE_TOKENS,
    isLoading: false,
    error: null,
  }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(element: React.ReactElement): void {
  act(() => root.render(element));
}

function click(element: Element | null): void {
  if (element === null) {
    throw new Error("Expected an element to click");
  }
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("preview widths", () => {
  it("names every width instead of showing pixels", () => {
    const onWidthChange = vi.fn();
    render(<CatalogPreviewWidthControl widthId="fit" onWidthChange={onWidthChange} />);
    const labels = [...container.querySelectorAll("button")].map((node) => node.textContent);
    expect(labels).toEqual(["Fit", "Mobile", "Tablet", "Desktop"]);
    expect(container.textContent).not.toContain("375");
    expect(container.querySelector('[aria-pressed="true"]')?.textContent).toBe("Fit");
    click([...container.querySelectorAll("button")].find((node) => node.textContent === "Desktop") ?? null);
    expect(onWidthChange).toHaveBeenCalledWith("desktop");
  });

  it("fills the pane on fit and fixes the width otherwise", () => {
    render(<CatalogPreviewFrame widthId="fit"><p>fit</p></CatalogPreviewFrame>);
    const fit = container.querySelector<HTMLElement>('[data-testid="catalog-preview-frame"]');
    expect(fit?.style.width).toBe("");
    render(<CatalogPreviewFrame widthId="mobile"><p>mobile</p></CatalogPreviewFrame>);
    const mobile = container.querySelector<HTMLElement>('[data-testid="catalog-preview-frame"]');
    expect(mobile?.style.width).toBe("375px");
    expect(mobile?.getAttribute("aria-label")).toBe("Preview");
  });

  it("keeps every declared width reachable", () => {
    expect(CATALOG_PREVIEW_WIDTH_IDS).toEqual(["fit", "mobile", "tablet", "desktop"]);
  });
});

describe("section preview pane", () => {
  it("renders the draft section in the platform appearance", () => {
    render(<CatalogEditorSectionPane appId="app-1" draft={createCatalogDraft("SECTION")} />);
    expect(container.textContent).toContain("Engaging Headline Goes Here");
    expect(container.textContent).toContain("Section bounds");
    expect(container.textContent).toContain("Preview in theme");
    const themed = container.querySelector<HTMLElement>('[data-cms-theme="true"]');
    expect(themed?.style.getPropertyValue("--cms-color-primary")).toBe(DEFAULT_APPEARANCE_TOKENS.colorPrimary);
    expect(themed?.style.getPropertyValue("--cms-text-hero")).toBe(DEFAULT_APPEARANCE_TOKENS.textHeroSize);
  });

  it("offers the published themes and opens on the platform default", () => {
    render(<CatalogEditorSectionPane appId="app-1" draft={createCatalogDraft("SECTION")} />);
    expect(container.textContent).toContain("Platform default appearance");
    click(container.querySelector('[aria-label="Preview theme"]'));
    expect(document.body.textContent).toContain("Coastal Linen");
  });

  it("explains an invalid section payload instead of rendering it", () => {
    const draft = { ...createCatalogDraft("SECTION"), definition: {} };
    render(<CatalogEditorSectionPane appId="app-1" draft={draft} />);
    expect(container.textContent).toContain("cannot be previewed");
  });

  it("never offers a page control", () => {
    render(<CatalogEditorSectionPane appId="app-1" draft={createCatalogDraft("SECTION")} />);
    expect(container.textContent).not.toContain("Page 1 of");
    expect(container.querySelector('[aria-label="Page"]')).toBeNull();
  });
});

describe("discard draft dialog", () => {
  it("keeps editing or discards explicitly", () => {
    const onKeepEditing = vi.fn();
    const onDiscard = vi.fn();
    render(<CatalogDiscardDialog onKeepEditing={onKeepEditing} onDiscard={onDiscard} />);
    expect(document.body.textContent).toContain("Discard this draft?");
    click([...document.querySelectorAll("button")].find((node) => node.textContent === "Keep editing") ?? null);
    expect(onKeepEditing).toHaveBeenCalled();
    click([...document.querySelectorAll("button")].find((node) => node.textContent === "Discard") ?? null);
    expect(onDiscard).toHaveBeenCalled();
  });
});
