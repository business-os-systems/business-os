// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CmsPageDto, CmsSiteDto } from "../src/lib/api/site-client";

const mocks = vi.hoisted(() => ({
  useStudioData: vi.fn(),
  useStudioActions: vi.fn(),
}));

vi.mock("../src/components/studio/use-studio-data", () => ({
  useStudioData: mocks.useStudioData,
}));
vi.mock("../src/components/studio/use-studio-actions", () => ({
  useStudioActions: mocks.useStudioActions,
}));
vi.mock("../src/components/studio/studio-editor", () => ({
  StudioEditor: () => <div>Editor canvas</div>,
}));

import { StudioWorkspace } from "../src/components/studio/studio-workspace";

const NOW = "2026-11-11T00:00:00.000Z";
const SITE: CmsSiteDto = {
  id: "site_workspace",
  organizationId: "org_workspace",
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
  siteId: SITE.id,
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

const reload = vi.fn(() => Promise.resolve());
const actions = {
  selectPage: vi.fn(),
  createPage: vi.fn(() => Promise.resolve()),
  renamePage: vi.fn(() => Promise.resolve()),
  reorderPage: vi.fn(() => Promise.resolve()),
  duplicatePage: vi.fn(() => Promise.resolve()),
  archivePage: vi.fn(() => Promise.resolve()),
  switchSite: vi.fn(),
};

function data(overrides: Record<string, unknown>) {
  return {
    site: null,
    sites: [],
    pages: [],
    isLoading: false,
    error: null,
    reload,
    setPages: vi.fn(),
    ...overrides,
  };
}

function renderWorkspace(): void {
  render(
    <StudioWorkspace
      siteId={SITE.id}
      pageId={PAGE.id}
      canWrite
      userPermissions={[]}
      currentUserId="usr_workspace"
      currentUserName="Rohit"
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useStudioActions.mockReturnValue(actions);
});

afterEach(cleanup);

describe("Studio workspace states (FR-079)", () => {
  it("shows the loading state", () => {
    mocks.useStudioData.mockReturnValue(data({ isLoading: true }));
    renderWorkspace();
    expect(screen.getByText("Loading studio...")).toBeTruthy();
  });

  it("shows the read error and retries", () => {
    mocks.useStudioData.mockReturnValue(data({ error: "Studio unavailable." }));
    renderWorkspace();
    expect(screen.getByText("Studio unavailable.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalled();
  });

  it("waits for the home fallback when the site is missing", () => {
    mocks.useStudioData.mockReturnValue(data({}));
    renderWorkspace();
    expect(screen.getByText("Opening the home page...")).toBeTruthy();
  });

  it("renders the shell for the active page", () => {
    mocks.useStudioData.mockReturnValue(data({ site: SITE, pages: [PAGE] }));
    renderWorkspace();
    expect(screen.getByText("Editor canvas")).toBeTruthy();
    expect(document.querySelectorAll("[data-studio-topbar]")).toHaveLength(1);
    expect(screen.getByText("Riverview")).toBeTruthy();
  });
});
