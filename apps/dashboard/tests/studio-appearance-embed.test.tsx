// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PERMISSIONS } from "@suite/core";
import { DEFAULT_APPEARANCE_TOKENS } from "@suite/website-builder/appearance";
import { StudioShell } from "../src/components/studio/studio-shell";
import type { CmsPageDto, CmsSiteDto } from "../src/lib/api/site-client";

const NOW = "2026-11-11T00:00:00.000Z";
const SITE_ID = "site_appearance_studio";

const SITE: CmsSiteDto = {
  id: SITE_ID,
  organizationId: "org_1",
  branchId: null,
  title: "Riverview",
  slug: "riverview",
  status: "DRAFT",
  timezone: "Asia/Kolkata",
  primaryLocale: "en",
  pagesCount: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

const PAGE: CmsPageDto = {
  id: "page_home",
  siteId: SITE_ID,
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

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function envelope(data: unknown): unknown {
  return { success: true, data, requestId: "req_appearance_studio", timestamp: NOW };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const noop = vi.fn(() => Promise.resolve());

function renderStudio(): void {
  render(
    <StudioShell
      site={SITE}
      sites={[SITE]}
      pages={[PAGE]}
      activePage={PAGE}
      canWrite
      userPermissions={[PERMISSIONS.WEBSITE_BUILDER.THEME_MANAGE]}
      currentUserId="usr_1"
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
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/catalog/sections")) {
        return Promise.resolve(jsonResponse(envelope({ items: [] })));
      }
      if (url.endsWith("/sites/" + SITE_ID + "/appearance")) {
        return Promise.resolve(
          jsonResponse(
            envelope({
              appearance: {
                siteId: SITE_ID,
                brandName: SITE.title,
                brandLogoUrl: null,
                draftTokens: DEFAULT_APPEARANCE_TOKENS,
                publishedTokens: DEFAULT_APPEARANCE_TOKENS,
                sourceItemId: null,
                sourceVersion: null,
                version: 1,
                publishedAt: NOW,
                hasUnpublishedChanges: false,
              },
            })
          )
        );
      }
      if (url.endsWith("/themes")) {
        return Promise.resolve(jsonResponse(envelope({ items: [] })));
      }
      if (url.endsWith("/sites/" + SITE_ID)) {
        return Promise.resolve(jsonResponse(envelope({ site: SITE })));
      }
      if (url.includes("/content")) {
        return Promise.resolve(
          jsonResponse(
            envelope({
              content: {
                pageId: PAGE.id,
                revision: 1,
                draftAst: { version: 1, schemaVersion: "2026-03", sections: [] },
                publishedAst: null,
                media: {},
                updatedAt: NOW,
                lastEditedByUserId: null,
                lastEditedAt: null,
              },
            })
          )
        );
      }
      return Promise.reject(new Error("Unexpected request " + url));
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Appearance inside the studio (FR-151, T152)", () => {
  it("opens appearance in the studio body and returns to the editor without leaving the page", async () => {
    renderStudio();

    expect(await screen.findByText("All changes saved")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));

    expect(await screen.findByText("Theme gallery")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publish appearance" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to editor" })).toBeTruthy();
    expect(screen.getByLabelText("Switch site")).toBeTruthy();
    expect(screen.getByText("Appearance")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back to editor" }));
    expect(screen.queryByText("Theme gallery")).toBeNull();
  });
});
