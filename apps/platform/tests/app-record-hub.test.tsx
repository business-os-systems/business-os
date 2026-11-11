// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import type { CatalogApp } from "../src/lib/apps-api";
import {
  APP_RECORD_NAV_GROUPS,
  appRecordHref,
  appRecordIdFromPathname,
  isAppRecordHubRoute,
  isAppRecordKnownDestination,
  visibleAppRecordGroups,
} from "../src/components/layout/app-record-nav.config";
import {
  AppRecordMobileSwitcher,
  AppRecordNavSidebar,
} from "../src/components/layout/app-record-nav";
import { canAccessPath, visibleNavigation } from "../src/components/layout/navigation.config";
import { PlatformShell } from "../src/components/layout/platform-shell";
import {
  AppRecordProvider,
  useAppRecord,
} from "../src/app/(platform)/apps/[appId]/app-record-context";
import { AppOverviewPanel } from "../src/app/(platform)/apps/[appId]/app-overview-panel";
import AppRecordLayout from "../src/app/(platform)/apps/[appId]/layout";
import AppRecordOverviewPage from "../src/app/(platform)/apps/[appId]/overview/page";
import AppRecordUnknownPage from "../src/app/(platform)/apps/[appId]/[...unknown]/page";
import AppRecordIndexPage from "../src/app/(platform)/apps/[appId]/page";
import AppRecordNotFound from "../src/app/(platform)/apps/[appId]/not-found";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchAppCatalog = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const navState = vi.hoisted(() => ({
  pathname: "/apps/website-builder/overview",
  appId: "website-builder",
  push: vi.fn(),
}));
const authState = vi.hoisted(() => ({
  capabilities: [] as string[],
  isSignedIn: true,
}));

vi.mock("@/lib/apps-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/apps-api")>();
  return { ...actual, fetchAppCatalog };
});

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({ push: navState.push, replace: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ appId: navState.appId }),
  useSearchParams: () => new URLSearchParams(),
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock("../src/components/auth/auth-provider", () => ({
  usePlatformAuth: () => ({
    session: authState.isSignedIn
      ? {
          operator: { id: "op_1", email: "ops@example.com", displayName: "Ops" },
          capabilities: authState.capabilities,
        }
      : null,
    loading: false,
    error: null,
    signOutFailed: false,
    refresh: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    forceSignOut: () => undefined,
  }),
}));

const APP_ID = "website-builder";
const APP: CatalogApp = {
  appId: APP_ID,
  name: "Website Builder",
  title: "Website Builder & Headless CMS",
  description: "Visual canvas studio.",
  category: "content",
  availability: "AVAILABLE",
  sortOrder: 0,
  installedCount: 7,
  version: "2026-11-07T10:00:00.000000Z",
  updatedAt: "2026-11-07T10:00:00.000Z",
};

function withRecord(element: ReactElement): ReactElement {
  return (
    <AppRecordProvider value={{ app: APP, reload: () => undefined }}>{element}</AppRecordProvider>
  );
}

function UnprovidedRecord(): ReactElement {
  useAppRecord();
  return <p>record</p>;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  authState.capabilities = [PLATFORM_CAPABILITIES.APPS_READ.code];
  authState.isSignedIn = true;
  navState.pathname = `/apps/${APP_ID}/overview`;
  navState.appId = APP_ID;
  navState.push.mockReset();
  fetchAppCatalog.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Application record navigation config", () => {
  it("declares the record group and every destination as a route", () => {
    expect(APP_RECORD_NAV_GROUPS.map((group) => group.id)).toEqual([
      "record",
      "catalog",
      "operations",
    ]);
    const items = APP_RECORD_NAV_GROUPS.flatMap((group) => group.items);
    expect(items.map((item) => item.id)).toEqual([
      "overview",
      "settings",
      "sections",
      "templates",
      "themes",
      "rollout",
      "activity",
    ]);
    for (const item of items) {
      expect(appRecordHref(APP_ID, item.segment)).toBe(`/apps/${APP_ID}/${item.segment}`);
    }
  });

  it("fails closed when the capability context is missing or empty", () => {
    expect(visibleAppRecordGroups(undefined)).toEqual([]);
    expect(visibleAppRecordGroups([])).toEqual([]);
  });

  it("filters destinations by capability", () => {
    const ids = (capability: string) =>
      visibleAppRecordGroups([capability]).flatMap((group) => group.items.map((item) => item.id));
    expect(ids(PLATFORM_CAPABILITIES.APPS_READ.code)).toEqual([
      "overview",
      "settings",
      "sections",
      "templates",
      "themes",
      "rollout",
      "activity",
    ]);
    expect(ids(PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code)).toEqual([
      "overview",
      "settings",
      "sections",
      "templates",
      "themes",
      "rollout",
      "activity",
    ]);
  });

});

describe("Application record hub routing", () => {
  it("recognizes hub routes and active destinations", () => {
    expect(isAppRecordHubRoute("/apps")).toBe(false);
    expect(isAppRecordHubRoute(`/apps/${APP_ID}`)).toBe(true);
    expect(isAppRecordHubRoute(`/apps/${APP_ID}/overview`)).toBe(true);
    expect(isAppRecordKnownDestination(`/apps/${APP_ID}`)).toBe(true);
    expect(isAppRecordKnownDestination(`/apps/${APP_ID}/overview`)).toBe(true);
    expect(isAppRecordKnownDestination(`/apps/${APP_ID}/settings`)).toBe(true);
    expect(isAppRecordKnownDestination(`/apps/${APP_ID}/sections`)).toBe(true);
    expect(isAppRecordKnownDestination(`/apps/${APP_ID}/rollout`)).toBe(true);
    expect(isAppRecordKnownDestination(`/apps/${APP_ID}/activity`)).toBe(true);
    expect(isAppRecordKnownDestination(`/apps/${APP_ID}/preview/abc`)).toBe(true);
    expect(isAppRecordKnownDestination(`/apps/${APP_ID}/preview/abc/extra`)).toBe(false);
    expect(isAppRecordKnownDestination(`/apps/${APP_ID}/preview/..`)).toBe(false);
    expect(
      isAppRecordKnownDestination(`/apps/${APP_ID}/overview/extra`),
    ).toBe(false);
    expect(appRecordIdFromPathname("/apps/../overview")).toBeNull();
  });

  it("denies every record path without the read capability", () => {
    expect(visibleNavigation([PLATFORM_CAPABILITIES.APPS_READ.code])).toEqual([
      expect.objectContaining({ id: "apps" }),
    ]);
    expect(canAccessPath([], "/apps")).toBe(false);
    expect(canAccessPath([], `/apps/${APP_ID}`)).toBe(false);
    expect(canAccessPath([], `/apps/${APP_ID}/overview`)).toBe(false);
    expect(canAccessPath([], `/apps/${APP_ID}/unknown`)).toBe(false);
    expect(canAccessPath([PLATFORM_CAPABILITIES.APPS_READ.code], `/apps/${APP_ID}/unknown`)).toBe(
      false,
    );
    expect(canAccessPath([PLATFORM_CAPABILITIES.APPS_READ.code], `/apps/${APP_ID}/sections`)).toBe(
      true,
    );
    expect(
      canAccessPath([PLATFORM_CAPABILITIES.APPS_READ.code], `/apps/${APP_ID}/preview/item_1`),
    ).toBe(true);
  });
});

describe("Application record navigation rendering", () => {
  it("renders the permitted destinations and the back link", () => {
    const html = renderToString(
      <AppRecordNavSidebar appId={APP_ID} capabilities={[PLATFORM_CAPABILITIES.APPS_READ.code]} />,
    );
    expect(html).toContain("Overview");
    expect(html).toContain(`href="/apps/${APP_ID}/overview"`);
    expect(html).toContain(`href="/apps"`);
    expect(html).toContain("All applications");
    expect(html).toContain('aria-current="page"');
  });

  it("renders no destination without capabilities", () => {
    const html = renderToString(<AppRecordNavSidebar appId={APP_ID} capabilities={[]} />);
    expect(html).not.toContain(">Overview<");
    expect(html).toContain("All applications");
  });

  it("renders the compact mobile switcher", () => {
    const html = renderToString(
      <AppRecordMobileSwitcher
        appId={APP_ID}
        capabilities={[PLATFORM_CAPABILITIES.APPS_READ.code]}
      />,
    );
    expect(html).toContain('aria-label="Application record section"');
  });
});

describe("Application record shell", () => {
  it("collapses the primary rail and renders the record panel beside the content", () => {
    const html = renderToString(
      <PlatformShell>
        <p>Record content</p>
      </PlatformShell>,
    );
    expect(html).toContain("w-16");
    const navStart = html.indexOf('aria-label="Application record"');
    const mainStart = html.indexOf("<main");
    expect(navStart).toBeGreaterThan(-1);
    expect(mainStart).toBeGreaterThan(-1);
    expect(navStart).toBeLessThan(mainStart);
    expect(html).toContain("Record content");
  });

  it("expands the rail on the applications collection", () => {
    navState.pathname = "/apps";
    const html = renderToString(
      <PlatformShell>
        <p>Applications</p>
      </PlatformShell>,
    );
    expect(html).toContain("w-52");
    expect(html).not.toContain('aria-label="Application record"');
  });

  it("denies a direct visit without the read capability", () => {
    authState.capabilities = [];
    const html = renderToString(
      <PlatformShell>
        <h1>Application record</h1>
      </PlatformShell>,
    );
    expect(html).toContain("Access denied");
    expect(html).not.toContain("Application record</h1>");
  });
});

describe("Application record overview", () => {
  it("shows identity, version, status and install count", () => {
    const html = renderToString(withRecord(<AppRecordOverviewPage />));
    expect(html).toContain("Website Builder &amp; Headless CMS");
    expect(html).toContain(APP_ID);
    expect(html).toContain("Available");
    expect(html).toContain("1.0.0");
    expect(html).toContain(APP.version ?? "No catalog override");
    expect(html).toContain("Installed tenants");
    expect(html).toContain(String(APP.installedCount));
  });

  it("keeps access for an operator who manages entitlements", () => {
    authState.capabilities = [
      PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
    ];
    expect(renderToString(withRecord(<AppRecordOverviewPage />))).toContain(
      "Website Builder &amp; Headless CMS",
    );
  });

  it("renders an unavailable manifest version without guessing", () => {
    const html = renderToString(
      <AppOverviewPanel app={{ ...APP, appId: "unregistered-app" }} />,
    );
    expect(html).toContain("Unavailable");
  });

  it("denies the panel without the read capability", () => {
    authState.capabilities = [];
    expect(renderToString(withRecord(<AppRecordOverviewPage />))).toContain("Capability denied");
  });
});

describe("Application record routing", () => {
  it("renders the record not-found surface", () => {
    const html = renderToString(<AppRecordNotFound />);
    expect(html).toContain("Back to applications");
  });

  it("requires the record provider", () => {
    expect(() => renderToString(<UnprovidedRecord />)).toThrow(
      "useAppRecord must be used inside the application record.",
    );
  });

  it("sends an unconfigured record path to not-found", () => {
    notFoundMock.mockReset();
    AppRecordUnknownPage();
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("redirects a valid record root to Overview", async () => {
    notFoundMock.mockReset();
    redirectMock.mockReset();
    await AppRecordIndexPage({
      params: Promise.resolve({ appId: APP_ID }),
    });
    expect(redirectMock).toHaveBeenCalledWith(
      `/apps/${APP_ID}/overview`,
    );
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid application id before redirecting", async () => {
    notFoundMock.mockReset();
    redirectMock.mockReset();
    await AppRecordIndexPage({
      params: Promise.resolve({ appId: ".." }),
    });
    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("Application record layout", () => {
  it("fetches the record once and renders its panel", async () => {
    let resolveApps: ((apps: readonly CatalogApp[]) => void) | undefined;
    fetchAppCatalog.mockReturnValue(
      new Promise<readonly CatalogApp[]>((resolve) => {
        resolveApps = resolve;
      }),
    );

    await act(async () => {
      root.render(
        <AppRecordLayout>
          <p>Overview panel</p>
        </AppRecordLayout>,
      );
      await Promise.resolve();
    });

    expect(fetchAppCatalog).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain(APP.title);

    await act(async () => {
      resolveApps?.([APP]);
      await Promise.resolve();
    });

    expect(container.textContent).toContain(APP.title);
    expect(container.textContent).toContain("Overview panel");
  });

  it("renders a not-found state for an application outside the registry", async () => {
    fetchAppCatalog.mockResolvedValue([]);

    await act(async () => {
      root.render(
        <AppRecordLayout>
          <p>Overview panel</p>
        </AppRecordLayout>,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Application not found");
    expect(container.textContent).not.toContain("Overview panel");
  });
});

describe("Application record layout states", () => {
  it("renders the retry state when the catalog read fails", async () => {
    fetchAppCatalog.mockRejectedValueOnce(new Error("Read failed"));

    await act(async () => {
      root.render(
        <AppRecordLayout>
          <p>Overview panel</p>
        </AppRecordLayout>,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Unable to load this application");
    expect(container.textContent).toContain("Read failed");
  });

  it("renders nothing while signed out", async () => {
    authState.isSignedIn = false;
    await act(async () => {
      root.render(
        <AppRecordLayout>
          <p>Overview panel</p>
        </AppRecordLayout>,
      );
      await Promise.resolve();
    });
    expect(container.textContent).toBe("");
    expect(fetchAppCatalog).not.toHaveBeenCalled();
  });

  it("denies a direct render without the read capability", async () => {
    authState.capabilities = [];
    await act(async () => {
      root.render(
        <AppRecordLayout>
          <p>Overview panel</p>
        </AppRecordLayout>,
      );
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Capability denied");
  });

  it("renders missing for an invalid application id", async () => {
    navState.appId = "..";
    await act(async () => {
      root.render(
        <AppRecordLayout>
          <p>Overview panel</p>
        </AppRecordLayout>,
      );
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Application not found");
    expect(fetchAppCatalog).not.toHaveBeenCalled();
  });
});
