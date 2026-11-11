// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { recordLastEditedPage } from "@suite/website-builder/editor";
import type { CmsPageDto, CmsRedirectDto, CmsSiteDto } from "../src/lib/api/site-client";

const navigation = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation.router,
}));

import { createRedirectTableConfig } from "../src/components/studio/studio-redirects.config";
import { StudioDomains } from "../src/components/studio/studio-domains";
import { StudioEntry } from "../src/components/studio/studio-entry";
import { StudioInquiries } from "../src/components/studio/studio-inquiries";
import { StudioRedirects } from "../src/components/studio/studio-redirects";
import { StudioSiteSettings } from "../src/components/studio/studio-site-settings";
import { StudioTopBar } from "../src/components/studio/studio-topbar";
import { useStudioData } from "../src/components/studio/use-studio-data";

const NOW = "2026-11-11T00:00:00.000Z";
const SITE_ID = "site_bodies";
const INQUIRIES_PATH = "/api/cms/inquiries";
const SITE_PAGES_PATH = "/sites/" + SITE_ID + "/pages";
const STUDIO_BASE = "/dashboard/sites/" + SITE_ID + "/studio/";

const SITE: CmsSiteDto = {
  id: SITE_ID,
  organizationId: "org_bodies",
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
    ...overrides,
  };
}

const HOME = page({});
const MENU = page({ id: "page_menu", title: "Menu", path: "/menu", orderIndex: 1, isHomePage: false });

const REDIRECT: CmsRedirectDto = {
  id: "redirect_1",
  siteId: SITE_ID,
  sourcePath: "/rates",
  targetPath: "/pricing",
  type: "PERMANENT",
  createdAt: NOW,
};

const INQUIRY = {
  id: "inquiry_1",
  siteId: SITE_ID,
  pageId: HOME.id,
  blockId: "blk_contact",
  status: "NEW" as const,
  preview: "Do you have a table for tonight?",
  submittedAt: NOW,
  readAt: null,
  archivedAt: null,
  retentionExpiresAt: NOW,
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
  return { success: true, data, requestId: "req_bodies", timestamp: NOW };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": status >= 400 ? "application/problem+json" : "application/json",
    },
  });
}

function problem(detail: string): Response {
  return jsonResponse(
    {
      type: "/errors/cms-request-failed",
      title: "Request failed",
      status: 500,
      detail,
      code: "INTERNAL_ERROR",
    },
    500
  );
}

type Responder = (url: string, init?: RequestInit) => Promise<Response> | undefined;

function installFetch(responder: Responder): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const response = responder(url, init);
    if (response === undefined) {
      return Promise.reject(new Error("Unexpected request " + url));
    }
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function siteResponse(): Promise<Response> {
  return Promise.resolve(jsonResponse(envelope({ site: SITE })));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  navigation.router.push.mockReset();
  navigation.router.replace.mockReset();
});

describe("Site settings destination body (FR-082)", () => {
  it("renders the site record once loaded", async () => {
    installFetch((url) => (url.endsWith("/sites/" + SITE_ID) ? siteResponse() : undefined));
    render(<StudioSiteSettings siteId={SITE_ID} />);
    expect(await screen.findByText("Riverview")).toBeTruthy();
    expect(screen.getByText("riverview")).toBeTruthy();
    expect(screen.getByText("Asia/Kolkata")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("shows the server problem and retries the read", async () => {
    let calls = 0;
    installFetch((url) => {
      if (!url.endsWith("/sites/" + SITE_ID)) return undefined;
      calls += 1;
      return calls === 1 ? Promise.resolve(problem("The site is unavailable.")) : siteResponse();
    });
    render(<StudioSiteSettings siteId={SITE_ID} />);
    expect(await screen.findByText("The site is unavailable.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Riverview")).toBeTruthy();
  });
});

describe("Domains destination body (FR-082)", () => {
  it("derives the platform address from the declared tenant host root", async () => {
    installFetch((url) => (url.endsWith("/sites/" + SITE_ID) ? siteResponse() : undefined));
    render(<StudioDomains siteId={SITE_ID} tenantRootDomain="example.test" />);
    expect(await screen.findByText("riverview.example.test")).toBeTruthy();
    expect(screen.getByText("No custom domains are attached")).toBeTruthy();
  });

  it("explains an unconfigured host root instead of inventing an address", async () => {
    installFetch((url) => (url.endsWith("/sites/" + SITE_ID) ? siteResponse() : undefined));
    render(<StudioDomains siteId={SITE_ID} tenantRootDomain={null} />);
    expect(
      await screen.findByText(/The tenant host root is not configured/)
    ).toBeTruthy();
  });
});

describe("Redirects destination body (FR-082)", () => {
  it("lists the redirects and their type", async () => {
    installFetch((url) => {
      if (url.endsWith("/sites/" + SITE_ID)) return siteResponse();
      if (url.includes("/redirects")) {
        return Promise.resolve(jsonResponse(envelope({ items: [REDIRECT], nextCursor: null })));
      }
      return undefined;
    });
    render(<StudioRedirects siteId={SITE_ID} />);
    expect(await screen.findByText("/rates")).toBeTruthy();
    expect(screen.getByText("/pricing")).toBeTruthy();
    expect(screen.getByText("PERMANENT")).toBeTruthy();
  });

  it("shows the empty state and the request problem on failure", async () => {
    installFetch((url) => {
      if (url.endsWith("/sites/" + SITE_ID)) return siteResponse();
      if (url.includes("/redirects")) {
        return Promise.resolve(jsonResponse(envelope({ items: [], nextCursor: null })));
      }
      return undefined;
    });
    const first = render(<StudioRedirects siteId={SITE_ID} />);
    expect(await screen.findByText("No redirects yet")).toBeTruthy();
    first.unmount();

    installFetch((url) => {
      if (url.endsWith("/sites/" + SITE_ID)) return siteResponse();
      if (url.includes("/redirects")) return Promise.resolve(problem("Redirects unavailable."));
      return undefined;
    });
    render(<StudioRedirects siteId={SITE_ID} />);
    expect(await screen.findByText("Redirects unavailable.")).toBeTruthy();
  });
});

describe("Enquiries destination body (FR-082)", () => {
  it("lists this site's enquiries with their status", async () => {
    installFetch((url) => {
      if (url.endsWith("/sites/" + SITE_ID)) return siteResponse();
      if (url.includes(INQUIRIES_PATH)) {
        return Promise.resolve(jsonResponse({ items: [INQUIRY], nextCursor: null }));
      }
      return undefined;
    });
    render(<StudioInquiries siteId={SITE_ID} />);
    expect(await screen.findByText("Do you have a table for tonight?")).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
  });

  it("surfaces an enquiries request failure with a retry", async () => {
    installFetch((url) => {
      if (url.endsWith("/sites/" + SITE_ID)) return siteResponse();
      if (url.includes(INQUIRIES_PATH)) {
        return Promise.resolve(problem("Inquiries unavailable."));
      }
      return undefined;
    });
    render(<StudioInquiries siteId={SITE_ID} />);
    expect(await screen.findByText("Inquiries unavailable.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("Studio entry resolution (FR-079)", () => {
  function installEntryFetch(): void {
    installFetch((url) => {
      if (url.endsWith("/sites/" + SITE_ID)) return siteResponse();
      if (url.includes(SITE_PAGES_PATH)) {
        return Promise.resolve(jsonResponse(envelope({ items: [HOME, MENU], nextCursor: null })));
      }
      return undefined;
    });
  }

  it("opens the remembered page when it still exists", async () => {
    recordLastEditedPage(
      { organizationId: SITE.organizationId, userId: "usr_entry", siteId: SITE_ID },
      MENU.id,
      window.localStorage
    );
    installEntryFetch();
    render(<StudioEntry siteId={SITE_ID} userId="usr_entry" />);
    await waitFor(() => {
      expect(navigation.router.replace).toHaveBeenCalledWith(
        STUDIO_BASE + MENU.id
      );
    });
  });

  it("falls back to the home page without history", async () => {
    installEntryFetch();
    render(<StudioEntry siteId={SITE_ID} userId="usr_new" />);
    await waitFor(() => {
      expect(navigation.router.replace).toHaveBeenCalledWith(
        STUDIO_BASE + HOME.id
      );
    });
  });

  it("shows the read failure instead of navigating to a guessed page", async () => {
    installFetch(() => Promise.resolve(problem("The site could not be read.")));
    render(<StudioEntry siteId={SITE_ID} userId="usr_entry" />);
    expect(await screen.findByText("The site could not be read.")).toBeTruthy();
  });
});

function StudioDataHarness(props: { readonly pageId: string }): React.ReactElement {
  const data = useStudioData({ siteId: SITE_ID, pageId: props.pageId, userId: "usr_data" });
  return (
    <div>
      <p>{data.isLoading ? "loading" : "ready"}</p>
      {data.error === null ? null : <p>{data.error}</p>}
      <p>{data.site?.title ?? "no site"}</p>
      <p>{String(data.pages.length)}</p>
      <p>{String(data.sites.length)}</p>
    </div>
  );
}

describe("Studio data loading (FR-079, FR-084)", () => {
  it("loads the site, tree and switcher sites and remembers the active page", async () => {
    installFetch((url) => {
      if (url.endsWith("/sites/" + SITE_ID)) return siteResponse();
      if (url.includes(SITE_PAGES_PATH)) {
        return Promise.resolve(jsonResponse(envelope({ items: [HOME, MENU], nextCursor: null })));
      }
      if (url.includes("/sites?limit=100")) {
        return Promise.resolve(jsonResponse(envelope({ items: [SITE], nextCursor: null })));
      }
      return undefined;
    });
    render(<StudioDataHarness pageId={MENU.id} />);
    expect(await screen.findByText("Riverview")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    await waitFor(() => {
      expect(
        window.localStorage.getItem(
          "website-builder:last-page:" + SITE.organizationId + ":usr_data:" + SITE_ID
        )
      ).toBe(MENU.id);
    });
  });

  it("falls back to the home page for an archived or unknown page", async () => {
    installFetch((url) => {
      if (url.endsWith("/sites/" + SITE_ID)) return siteResponse();
      if (url.includes(SITE_PAGES_PATH)) {
        return Promise.resolve(jsonResponse(envelope({ items: [HOME, MENU], nextCursor: null })));
      }
      return undefined;
    });
    render(<StudioDataHarness pageId="page_missing" />);
    await waitFor(() => {
      expect(navigation.router.replace).toHaveBeenCalledWith(
        STUDIO_BASE + HOME.id
      );
    });
  });

  it("reports a read failure", async () => {
    installFetch(() => Promise.resolve(problem("Studio data unavailable.")));
    render(<StudioDataHarness pageId={MENU.id} />);
    expect(await screen.findByText("Studio data unavailable.")).toBeTruthy();
  });
});

describe("Studio destination fallbacks (FR-082)", () => {
  it("shows a domains failure and retries the read", async () => {
    let calls = 0;
    installFetch((url) => {
      if (!url.endsWith("/sites/" + SITE_ID)) return undefined;
      calls += 1;
      return calls === 1 ? Promise.resolve(problem("Domains unavailable.")) : siteResponse();
    });
    render(<StudioDomains siteId={SITE_ID} tenantRootDomain="example.test" />);
    expect(await screen.findByText("Domains unavailable.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("riverview.example.test")).toBeTruthy();
  });

  it("formats unreadable dates and timezones without throwing", async () => {
    const oddSite = { ...SITE, createdAt: "not-a-date", timezone: "Mars/Olympus" };
    installFetch((url) =>
      url.endsWith("/sites/" + SITE_ID)
        ? Promise.resolve(jsonResponse(envelope({ site: oddSite })))
        : undefined
    );
    render(<StudioSiteSettings siteId={SITE_ID} />);
    expect(await screen.findByText("Unknown")).toBeTruthy();
  });

  it("renders an unreadable redirect timestamp as unknown", () => {
    const config = createRedirectTableConfig();
    const column = config.columns.find((entry) => entry.key === "createdAt");
    const renderTimestamp = column?.render;
    if (renderTimestamp === undefined) {
      throw new Error("The redirect table has no created-at renderer.");
    }
    const html = renderToString(
      <>{renderTimestamp("not-a-date", { ...REDIRECT, createdAt: "not-a-date" })}</>
    );
    expect(html).toContain("Unknown");
  });

});

describe("Enquiries destination failures (FR-082)", () => {
  it("surfaces a site failure on enquiries", async () => {
    installFetch((url) => {
      if (url.endsWith("/sites/" + SITE_ID)) return Promise.resolve(problem("Site unavailable."));
      if (url.includes(INQUIRIES_PATH)) {
        return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      }
      return undefined;
    });
    render(<StudioInquiries siteId={SITE_ID} />);
    expect(await screen.findByText("Site unavailable.")).toBeTruthy();
  });

  it("rejects an enquiries response that does not match the contract", async () => {
    installFetch((url) => {
      if (url.endsWith("/sites/" + SITE_ID)) return siteResponse();
      if (url.includes(INQUIRIES_PATH)) {
        return Promise.resolve(jsonResponse({ items: [{ id: "broken" }], nextCursor: null }));
      }
      return undefined;
    });
    render(<StudioInquiries siteId={SITE_ID} />);
    expect(
      await screen.findByText("The inquiries response did not match the expected contract.")
    ).toBeTruthy();
  });

  it("reports the status when an enquiries failure has no problem document", async () => {
    installFetch((url) => {
      if (url.endsWith("/sites/" + SITE_ID)) return siteResponse();
      if (url.includes(INQUIRIES_PATH)) {
        return Promise.resolve(jsonResponse({ oops: true }, 500));
      }
      return undefined;
    });
    render(<StudioInquiries siteId={SITE_ID} />);
    expect(
      await screen.findByText("The inquiries request failed with status 500.")
    ).toBeTruthy();
  });

  it("keeps the current site selectable when the switcher list omits it", () => {
    render(
      <StudioTopBar
        site={SITE}
        sites={[{ ...SITE, id: "site_other", title: "Other" }]}
        activePage={HOME}
        canWrite
        canManageAppearance
        toolbar={null}
        device="desktop"
        zoom={1}
        onDeviceChange={vi.fn()}
        onZoomChange={vi.fn()}
        isAppearanceOpen={false}
        onToggleAppearance={vi.fn()}
        onSwitchSite={vi.fn()}
      />
    );
    expect(screen.getByRole("option", { name: "Riverview" })).toBeTruthy();
  });
});

describe("Studio entry failure paths (FR-079)", () => {
  it("reports a site with no live pages", async () => {
    installFetch((url) => {
      if (url.endsWith("/sites/" + SITE_ID)) return siteResponse();
      if (url.includes(SITE_PAGES_PATH)) {
        return Promise.resolve(jsonResponse(envelope({ items: [], nextCursor: null })));
      }
      return undefined;
    });
    render(<StudioEntry siteId={SITE_ID} userId="usr_empty" />);
    expect(await screen.findByText("This site has no live pages yet.")).toBeTruthy();
  });

  it("falls back to the home page when browser storage denies the read", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage denied");
    });
    installFetch((url) => {
      if (url.endsWith("/sites/" + SITE_ID)) return siteResponse();
      if (url.includes(SITE_PAGES_PATH)) {
        return Promise.resolve(jsonResponse(envelope({ items: [HOME, MENU], nextCursor: null })));
      }
      return undefined;
    });
    render(<StudioEntry siteId={SITE_ID} userId="usr_denied" />);
    await waitFor(() => {
      expect(navigation.router.replace).toHaveBeenCalledWith(
        STUDIO_BASE + HOME.id
      );
    });
  });
});

describe("Studio data resilience (FR-079)", () => {
  it("keeps editing when the site switcher list fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    installFetch((url) => {
      if (url.endsWith("/sites/" + SITE_ID)) return siteResponse();
      if (url.includes(SITE_PAGES_PATH)) {
        return Promise.resolve(jsonResponse(envelope({ items: [HOME, MENU], nextCursor: null })));
      }
      if (url.includes("/sites?limit=100")) return Promise.resolve(problem("Switcher down."));
      return undefined;
    });
    render(<StudioDataHarness pageId={MENU.id} />);
    expect(await screen.findByText("Riverview")).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();
  });

  it("keeps editing when browser storage denies the write", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage denied");
    });
    installFetch((url) => {
      if (url.endsWith("/sites/" + SITE_ID)) return siteResponse();
      if (url.includes(SITE_PAGES_PATH)) {
        return Promise.resolve(jsonResponse(envelope({ items: [HOME, MENU], nextCursor: null })));
      }
      return undefined;
    });
    render(<StudioDataHarness pageId={MENU.id} />);
    expect(await screen.findByText("Riverview")).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();
  });
});


describe("Studio entry cancellation (FR-079)", () => {
  it("does not navigate after the surface has unmounted", async () => {
    const pending: { site?: (value: Response) => void; pages?: (value: Response) => void } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.endsWith("/sites/" + SITE_ID)) {
          return new Promise<Response>((resolve) => {
            pending.site = resolve;
          });
        }
        if (url.includes("/sites/" + SITE_ID + "/pages")) {
          return new Promise<Response>((resolve) => {
            pending.pages = resolve;
          });
        }
        return Promise.reject(new Error("Unexpected request " + url));
      })
    );
    const view = render(<StudioEntry siteId={SITE_ID} userId="usr_cancel" />);
    view.unmount();
    pending.site?.(jsonResponse(envelope({ site: SITE })));
    pending.pages?.(jsonResponse(envelope({ items: [HOME, MENU], nextCursor: null })));
    await waitFor(() => {
      expect(navigation.router.replace).not.toHaveBeenCalled();
    });
  });
});


describe("Studio data empty state (FR-079)", () => {
  it("reports a site with no live pages", async () => {
    installFetch((url) => {
      if (url.endsWith("/sites/" + SITE_ID)) return siteResponse();
      if (url.includes("/sites/" + SITE_ID + "/pages")) {
        return Promise.resolve(jsonResponse(envelope({ items: [], nextCursor: null })));
      }
      if (url.includes("/sites?limit=100")) {
        return Promise.resolve(jsonResponse(envelope({ items: [SITE], nextCursor: null })));
      }
      return undefined;
    });
    render(<StudioDataHarness pageId="page_missing" />);
    expect(await screen.findByText("This site has no live pages yet.")).toBeTruthy();
  });
});
