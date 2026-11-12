// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StudioShell } from "../src/components/studio/studio-shell";
import type { CmsPageDto, CmsSiteDto } from "../src/lib/api/site-client";
import type { PageAst } from "@suite/website-builder/ast";

const NOW = "2026-01-01T00:00:00.000Z";
/** The editor performs several scripted fetches; a loaded CI box can exceed 1s. */
const SLOW_RENDER = { timeout: 5000 } as const;

const SITE: CmsSiteDto = {
  id: "site_1",
  organizationId: "org_1",
  branchId: null,
  title: "Riverview",
  slug: "riverview",
  status: "DRAFT",
  timezone: "Asia/Kolkata",
  primaryLocale: "en-US",
  pagesCount: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

const PAGE: CmsPageDto = {
  id: "page_1",
  siteId: "site_1",
  parentId: null,
  title: "Home",
  path: "/",
  orderIndex: 0,
  status: "DRAFT",
  isHomePage: true,
  revision: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

function pageAst(headline: string): PageAst {
  return {
    version: 1,
    schemaVersion: "2026-03",
    sections: [
      { id: "sec_hero", name: "Hero", blocks: [{ id: "blk_hero", type: "hero", props: { headline } }] },
    ],
  };
}

function envelope(data: unknown) {
  return { success: true, data, requestId: "req_1", timestamp: NOW };
}

interface ServerState {
  revision: number;
  draftAst: PageAst;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

function createFetchMock(state: ServerState) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    await Promise.resolve();
    const url = requestUrl(input);
    if (url.includes("/catalog/sections")) {
      return new Response(
        JSON.stringify(
          envelope({
            items: [
              {
                id: "cat_tenant_hero",
                name: "Tenant hero",
                slug: "tenant-hero",
                category: "hospitality",
                industries: ["hospitality"],
                currentVersion: 1,
                previewRef: null,
                definition: { schemaVersion: "2026-03", block: pageAst("Catalog hero").sections[0]?.blocks[0] },
              },
            ],
          })
        ),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/content") && init?.method === "PATCH") {
      return new Response(
        JSON.stringify({
          type: "/errors/version-conflict",
          title: "Version Conflict",
          status: 409,
          detail: "The page changed. Your draft was kept in version history as version 2.",
          code: "VERSION_CONFLICT",
          timestamp: NOW,
        }),
        { status: 409, headers: { "Content-Type": "application/problem+json" } }
      );
    }
    if (url.includes("/content")) {
      return new Response(
        JSON.stringify(
          envelope({
            content: {
              pageId: "page_1",
              revision: state.revision,
              draftAst: state.draftAst,
              publishedAst: null,
              media: {},
              updatedAt: NOW,
              lastEditedByUserId: "usr_other",
              lastEditedAt: NOW,
            },
          })
        ),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    throw new Error("Unexpected request " + url);
  });
}

const noop = vi.fn(() => Promise.resolve());

function renderEditor(): void {
  render(
    <StudioShell
      site={SITE}
      sites={[SITE]}
      pages={[PAGE]}
      activePage={PAGE}
      canWrite
      userPermissions={[]}
      currentUserId="usr_me"
      currentUserName="Rohit"
      onSelectPage={vi.fn()}
      onCreatePage={noop}
      onRenamePage={noop}
      onReorderPage={noop}
      onDuplicatePage={noop}
      onArchivePage={noop}
      onSwitchSite={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("Studio editor UI (T066-T069, T094)", () => {
  it("loads the draft and catalog over HTTP and renders canvas, inspector and drawer", async () => {
    vi.stubGlobal("fetch", createFetchMock({ revision: 1, draftAst: pageAst("Harbour views") }));
    renderEditor();

    expect(await screen.findByText("Harbour views", undefined, SLOW_RENDER)).toBeTruthy();
    expect(screen.getByLabelText("Inspector")).toBeTruthy();
    expect(screen.getByText("No block selected")).toBeTruthy();
    expect(screen.getByText("All changes saved")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    expect(
      await screen.findByRole("dialog", { name: "Add a section" }, SLOW_RENDER)
    ).toBeTruthy();
    expect(await screen.findByText("Tenant hero", undefined, SLOW_RENDER)).toBeTruthy();
    expect(screen.getByText("Hospitality")).toBeTruthy();
  });

  it("shows the conflict dialog when the API rejects a stale save", async () => {
    vi.stubGlobal("fetch", createFetchMock({ revision: 2, draftAst: pageAst("Server headline") }));
    renderEditor();

    fireEvent.click(await screen.findByLabelText("Select hero block", undefined, SLOW_RENDER));
    const headlineInput = await screen.findByLabelText("Headline", undefined, SLOW_RENDER);
    fireEvent.change(headlineInput, { target: { value: "My headline" } });
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));

    expect(
      await screen.findByRole(
        "alertdialog",
        { name: "A newer version of this page was saved" },
        SLOW_RENDER
      )
    ).toBeTruthy();
    expect(screen.getByText("Your version")).toBeTruthy();
    expect(screen.getByText("Saved version")).toBeTruthy();
    expect(screen.getByText("Keep my version")).toBeTruthy();
    expect(screen.getByText("Keep their version")).toBeTruthy();

    fireEvent.click(screen.getByText("Keep their version"));
    expect(await screen.findByDisplayValue("Server headline", undefined, SLOW_RENDER)).toBeTruthy();
  });
});
