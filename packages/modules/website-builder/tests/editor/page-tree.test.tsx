import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  PageTree,
  buildPageTree,
  type PageTreePage,
} from "../../src/editor/layers/index.js";
import { pagePathError, siteSlugError } from "../../src/paths/page-paths.js";

const HOME_PAGE: PageTreePage = {
  id: "page_home",
  title: "Home",
  path: "/",
  parentId: null,
  isHomePage: true,
  status: "DRAFT",
  revision: 1,
  orderIndex: 0,
};
const ABOUT_PAGE: PageTreePage = {
  id: "page_about",
  title: "About Us",
  path: "/about-us",
  parentId: null,
  isHomePage: false,
  status: "DRAFT",
  revision: 2,
  orderIndex: 1,
};
const TEAM_PAGE: PageTreePage = {
  id: "page_team",
  title: "Our Team",
  path: "/about-us/team",
  parentId: "page_about",
  isHomePage: false,
  status: "DRAFT",
  revision: 1,
  orderIndex: 2,
};
const PAGES: PageTreePage[] = [HOME_PAGE, ABOUT_PAGE, TEAM_PAGE];
const noop = vi.fn(() => Promise.resolve());

function renderTree(activePageId: string, canWrite = true): string {
  return renderToString(
    <PageTree
      pages={PAGES}
      activePageId={activePageId}
      canWrite={canWrite}
      onSelectPage={vi.fn()}
      onCreatePage={noop}
      onRenamePage={noop}
      onDeletePage={noop}
    />
  );
}

describe("Page tree panel (T065)", () => {
  it("renders the hierarchy with levels and the active page highlighted", () => {
    const html = renderTree("page_team");
    expect(html).toContain('role="tree"');
    expect(html).toContain('aria-label="Site pages"');
    expect(html).toContain('aria-level="1"');
    expect(html).toContain('aria-level="2"');
    expect(html).toContain("Home");
    expect(html).toContain("About Us");
    expect(html).toContain("Our Team");
    expect(html).toContain("/about-us/team");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("3 pages");
  });

  it("offers add, rename and delete controls with the home page protected", () => {
    const html = renderTree("page_home");
    expect(html).toContain("Add page");
    expect(html).toContain('aria-label="Rename Home"');
    expect(html).toContain('aria-label="Delete Home"');
    expect(html).toContain('aria-label="Delete About Us"');
    expect(html).toContain('aria-label="Add page inside About Us"');
    expect(html).toMatch(/aria-label="Delete Home"[^>]*disabled/);
  });

  it("hides write controls for a read-only session", () => {
    const html = renderTree("page_home", false);
    expect(html).not.toContain("Add page");
    expect(html).not.toContain('aria-label="Rename Home"');
  });

  it("renders a genuine empty state", () => {
    const html = renderToString(
      <PageTree
        pages={[]}
        activePageId=""
        onSelectPage={vi.fn()}
        onCreatePage={noop}
        onRenamePage={noop}
        onDeletePage={noop}
      />
    );
    expect(html).toContain("This site has no pages yet.");
  });

  it("groups children under their parent and tolerates a cycle", () => {
    const roots = buildPageTree(PAGES);
    expect(roots).toHaveLength(2);
    expect(roots[1]?.children[0]?.title).toBe("Our Team");
    const cycle = buildPageTree([
      { ...HOME_PAGE, id: "a", parentId: "b" },
      { ...ABOUT_PAGE, id: "b", parentId: "a" },
    ]);
    expect(cycle).toHaveLength(2);
  });

  it("validates reserved addresses before the API call", () => {
    expect(pagePathError("/about-team")).toBeNull();
    expect(pagePathError("/dashboard")).toContain("reserved");
    expect(pagePathError("/api/v1")).toContain("reserved");
    expect(siteSlugError("dashboard")).toContain("reserved");
    expect(siteSlugError("river-view")).toBeNull();
  });
});
