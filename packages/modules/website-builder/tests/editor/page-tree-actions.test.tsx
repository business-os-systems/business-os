// @vitest-environment jsdom
import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { PageTree, type PageTreePage } from "../../src/editor/layers/index.js";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const HOME: PageTreePage = {
  id: "page_home",
  title: "Home",
  path: "/",
  parentId: null,
  isHomePage: true,
  status: "DRAFT",
  revision: 1,
  orderIndex: 0,
};
const ABOUT: PageTreePage = {
  id: "page_about",
  title: "About Us",
  path: "/about-us",
  parentId: null,
  isHomePage: false,
  status: "DRAFT",
  revision: 2,
  orderIndex: 1,
};
const OLD: PageTreePage = {
  id: "page_old",
  title: "Old offers",
  path: "/offers",
  parentId: null,
  isHomePage: false,
  status: "ARCHIVED",
  revision: 3,
  orderIndex: 2,
};
const PAGES: PageTreePage[] = [HOME, ABOUT, OLD];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderTree(overrides: {
  readonly canWrite?: boolean;
  readonly onReorderPage?: ReturnType<typeof vi.fn>;
  readonly onDuplicatePage?: ReturnType<typeof vi.fn>;
  readonly onArchivePage?: ReturnType<typeof vi.fn>;
} = {}): ReturnType<typeof vi.fn>[] {
  const handlers = [
    overrides.onReorderPage ?? vi.fn(() => Promise.resolve()),
    overrides.onDuplicatePage ?? vi.fn(() => Promise.resolve()),
    overrides.onArchivePage ?? vi.fn(() => Promise.resolve()),
  ];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <PageTree
        pages={PAGES}
        activePageId={HOME.id}
        canWrite={overrides.canWrite ?? true}
        onSelectPage={vi.fn()}
        onCreatePage={vi.fn(() => Promise.resolve())}
        onRenamePage={vi.fn(() => Promise.resolve())}
        onReorderPage={handlers[0] ?? vi.fn()}
        onDuplicatePage={handlers[1] ?? vi.fn()}
        onArchivePage={handlers[2] ?? vi.fn()}
      />
    );
  });
  return handlers;
}

function buttonByLabel(label: string): HTMLButtonElement | null {
  return container?.querySelector<HTMLButtonElement>('[aria-label="' + label + '"]') ?? null;
}

function requireButton(label: string): HTMLButtonElement {
  const button = buttonByLabel(label);
  if (button === null) {
    throw new Error("Expected the page tree action: " + label);
  }
  return button;
}

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("Page tree operations (FR-020, FR-080)", () => {
  it("marks archived pages and hides their write controls", () => {
    renderTree();
    expect(container?.textContent).toContain("Archived");
    expect(buttonByLabel("Rename Old offers")).toBeNull();
    expect(buttonByLabel("Archive Old offers")).toBeNull();
  });

  it("moves a page through the reorder control", async () => {
    const [onReorderPage] = renderTree();
    click(requireButton("Move About Us up"));
    await act(() => Promise.resolve());
    expect(onReorderPage).toHaveBeenCalledWith(ABOUT.id, "up", ABOUT.revision);
  });

  it("duplicates a page", async () => {
    const [, onDuplicatePage] = renderTree();
    click(requireButton("Duplicate About Us"));
    await act(() => Promise.resolve());
    expect(onDuplicatePage).toHaveBeenCalledWith(ABOUT.id);
  });

  it("archives a page after confirmation", async () => {
    const [, , onArchivePage] = renderTree();
    click(requireButton("Archive About Us"));
    const confirm = Array.from(container?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === "Archive page"
    );
    act(() => {
      confirm?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(() => Promise.resolve());
    expect(onArchivePage).toHaveBeenCalledWith(ABOUT.id, ABOUT.revision);
  });

  it("hides every write control in a read-only session", () => {
    renderTree({ canWrite: false });
    expect(container?.textContent).not.toContain("Add page");
    expect(buttonByLabel("Move About Us up")).toBeNull();
    expect(buttonByLabel("Duplicate About Us")).toBeNull();
    expect(buttonByLabel("Archive About Us")).toBeNull();
  });
});
