// @vitest-environment jsdom
import React, { type Dispatch, type SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  forgetLastEditedPage,
  readLastEditedPage,
  recordLastEditedPage,
  type EditorContextStorage,
} from "@suite/website-builder/editor";
import type { CmsPageDto, CmsSiteDto } from "../src/lib/api/site-client";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
}));

import { resolveEntryPage } from "../src/components/studio/studio-entry";
import { useStudioActions } from "../src/components/studio/use-studio-actions";

const NOW = "2026-11-11T00:00:00.000Z";
const SITE_PAGES_PATH = "/sites/site_1/pages";
const UNEXPECTED_REQUEST = "Unexpected request ";
const SITE: CmsSiteDto = {
  id: "site_1",
  organizationId: "org_1",
  branchId: null,
  title: "Riverview",
  slug: "riverview",
  status: "DRAFT",
  timezone: "Asia/Kolkata",
  primaryLocale: "en",
  pagesCount: 2,
  createdAt: NOW,
  updatedAt: NOW,
};

function page(overrides: Partial<CmsPageDto>): CmsPageDto {
  return {
    id: "page_home",
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
    ...overrides,
  };
}

const HOME = page({});
const MENU = page({
  id: "page_menu",
  title: "Menu",
  path: "/menu",
  orderIndex: 1,
  isHomePage: false,
});

function memoryStorage(): EditorContextStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

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
  return { success: true, data, requestId: "req_context", timestamp: NOW };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigation.push.mockReset();
  navigation.replace.mockReset();
});

describe("Last-edited page context (FR-079, FR-084)", () => {
  const scope = { organizationId: "org_1", userId: "usr_1", siteId: "site_1" };

  it("records, reads and forgets the page for one user and site", () => {
    const storage = memoryStorage();
    expect(readLastEditedPage(scope, storage)).toBeNull();
    recordLastEditedPage(scope, "page_menu", storage);
    expect(readLastEditedPage(scope, storage)).toBe("page_menu");
    expect(
      readLastEditedPage({ ...scope, userId: "usr_2" }, storage)
    ).toBeNull();
    forgetLastEditedPage(scope, storage);
    expect(readLastEditedPage(scope, storage)).toBeNull();
  });

  it("discards malformed stored values instead of using them as a page address", () => {
    const storage = memoryStorage();
    const key = [
      "website-builder:last-page",
      scope.organizationId,
      scope.userId,
      scope.siteId,
    ].join(":");
    storage.setItem(key, "../escape");
    expect(readLastEditedPage(scope, storage)).toBeNull();
    recordLastEditedPage(scope, "not a page id", storage);
    expect(readLastEditedPage(scope, storage)).toBeNull();
  });
});

describe("Studio entry resolution (FR-079)", () => {
  it("opens the last-edited page", () => {
    expect(resolveEntryPage([HOME, MENU], MENU.id)?.id).toBe(MENU.id);
  });

  it("falls back to the home page when the page is gone, archived or never recorded", () => {
    expect(resolveEntryPage([HOME], "page_deleted")?.id).toBe(HOME.id);
    expect(
      resolveEntryPage([HOME, { ...MENU, status: "ARCHIVED" }], MENU.id)?.id
    ).toBe(HOME.id);
    expect(resolveEntryPage([HOME, MENU], null)?.id).toBe(HOME.id);
  });
});

function ActionHarness(props: {
  readonly siteId?: string;
  readonly pageId?: string;
}): React.ReactElement {
  const actions = useStudioActions({
    siteId: props.siteId ?? SITE.id,
    pageId: props.pageId ?? MENU.id,
    setPages: () => undefined,
  });
  return (
    <div>
      <button type="button" onClick={() => actions.switchSite("site_2")}>
        Switch site
      </button>
      <button type="button" onClick={() => actions.selectPage("page_menu")}>
        Select page
      </button>
      <button
        type="button"
        onClick={() =>
          void actions.createPage({ title: "Offers", path: "/offers", parentId: null })
        }
      >
        Create page
      </button>
      <button type="button" onClick={() => void actions.duplicatePage(MENU.id)}>
        Duplicate
      </button>
      <button type="button" onClick={() => void actions.archivePage(MENU.id, MENU.revision)}>
        Archive
      </button>
      <button type="button" onClick={() => void actions.reorderPage(MENU.id, "up", MENU.revision)}>
        Move up
      </button>
    </div>
  );
}

describe("Studio site switching (FR-084)", () => {
  it("switches sites through the studio entry route so context is restored there", () => {
    render(<ActionHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Switch site" }));
    expect(navigation.push).toHaveBeenCalledWith("/dashboard/sites/site_2/studio");
  });
});

describe("Studio page operations (FR-080)", () => {
  it("opens a duplicated page immediately in the same session", async () => {
    const copy = page({
      id: "page_menu_copy",
      title: "Menu (copy)",
      path: "/menu-copy",
      orderIndex: 2,
      isHomePage: false,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url.endsWith("/pages/page_menu/duplicate") && init?.method === "POST") {
          return Promise.resolve(jsonResponse(envelope({ page: copy }), 201));
        }
        if (url.includes(SITE_PAGES_PATH)) {
          return Promise.resolve(jsonResponse(envelope({ items: [HOME, MENU, copy], nextCursor: null })));
        }
        return Promise.reject(new Error(UNEXPECTED_REQUEST + url));
      })
    );
    render(<ActionHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith(
        "/dashboard/sites/site_1/studio/page_menu_copy"
      );
    });
  });

  it("returns to the home page when the active page is archived", async () => {
    const archived = { ...MENU, status: "ARCHIVED" };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url.endsWith("/pages/page_menu/archive") && init?.method === "POST") {
          return Promise.resolve(jsonResponse(envelope({ page: archived })));
        }
        if (url.includes(SITE_PAGES_PATH)) {
          return Promise.resolve(jsonResponse(envelope({ items: [HOME], nextCursor: null })));
        }
        return Promise.reject(new Error(UNEXPECTED_REQUEST + url));
      })
    );
    render(<ActionHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith(
        "/dashboard/sites/site_1/studio/page_home"
      );
    });
  });

});

describe("Studio page reorder (FR-080)", () => {
  it("reorders through the page order route and refreshes the tree", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.endsWith("/pages/page_menu/order") && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse(envelope({ page: MENU })));
      }
      if (url.includes(SITE_PAGES_PATH)) {
        return Promise.resolve(jsonResponse(envelope({ items: [MENU, HOME], nextCursor: null })));
      }
      return Promise.reject(new Error(UNEXPECTED_REQUEST + url));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ActionHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Move up" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/cms/pages/page_menu/order",
        expect.objectContaining({ method: "PATCH" })
      );
    });
  });
});

describe("Studio page creation and selection (FR-080)", () => {
  it("opens a newly created page immediately in the same session", async () => {
    const created = page({
      id: "page_offers",
      title: "Offers",
      path: "/offers",
      orderIndex: 2,
      isHomePage: false,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url.endsWith(SITE_PAGES_PATH) && init?.method === "POST") {
          return Promise.resolve(jsonResponse(envelope({ page: created }), 201));
        }
        if (url.includes(SITE_PAGES_PATH)) {
          return Promise.resolve(
            jsonResponse(envelope({ items: [HOME, MENU, created], nextCursor: null }))
          );
        }
        return Promise.reject(new Error(UNEXPECTED_REQUEST + url));
      })
    );
    render(<ActionHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Create page" }));
    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith(
        "/dashboard/sites/site_1/studio/page_offers"
      );
    });
  });

  it("selects a page through its studio address", () => {
    render(<ActionHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Select page" }));
    expect(navigation.push).toHaveBeenCalledWith(
      "/dashboard/sites/site_1/studio/page_menu"
    );
  });

});

describe("Studio archive without a home fallback (FR-080)", () => {
  it("returns to the studio root when archiving leaves no home page", async () => {
    const archived = { ...MENU, status: "ARCHIVED" };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url.endsWith("/pages/page_menu/archive") && init?.method === "POST") {
          return Promise.resolve(jsonResponse(envelope({ page: archived })));
        }
        if (url.includes(SITE_PAGES_PATH)) {
          return Promise.resolve(jsonResponse(envelope({ items: [archived], nextCursor: null })));
        }
        return Promise.reject(new Error(UNEXPECTED_REQUEST + url));
      })
    );
    render(<ActionHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith("/dashboard/sites/site_1/studio");
    });
  });
});


function RenameHarness(props: {
  readonly setPages: Dispatch<SetStateAction<CmsPageDto[]>>;
}): React.ReactElement {
  const actions = useStudioActions({
    siteId: SITE.id,
    pageId: MENU.id,
    setPages: props.setPages,
  });
  return (
    <button
      type="button"
      onClick={() =>
        void actions.renamePage({
          pageId: MENU.id,
          title: "Our menu",
          path: "/our-menu",
          expectedRevision: MENU.revision,
        })
      }
    >
      Rename page
    </button>
  );
}

describe("Studio page rename (FR-080)", () => {
  it("replaces the renamed row in the tree", async () => {
    const renamed = { ...MENU, title: "Our menu", path: "/our-menu", revision: 2 };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url.endsWith("/pages/page_menu") && init?.method === "PATCH") {
          return Promise.resolve(jsonResponse(envelope({ page: renamed })));
        }
        return Promise.reject(new Error(UNEXPECTED_REQUEST + url));
      })
    );
    const setPages = vi.fn<Dispatch<SetStateAction<CmsPageDto[]>>>();
    render(<RenameHarness setPages={setPages} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename page" }));
    await waitFor(() => {
      expect(setPages).toHaveBeenCalled();
    });
    const updater = setPages.mock.calls[0]?.[0];
    if (typeof updater !== "function") {
      throw new Error("The rename action did not update the page tree.");
    }
    expect(updater([HOME, MENU])).toEqual([HOME, renamed]);
  });
});
