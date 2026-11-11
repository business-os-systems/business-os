// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import type { CatalogApp } from "../src/lib/apps-api";
import type { CatalogItem } from "../src/lib/catalog-api";
import { AppRecordProvider } from "../src/app/(platform)/apps/[appId]/app-record-context";
import AppRecordRolloutPage from "../src/app/(platform)/apps/[appId]/rollout/page";
import AppRecordActivityPage from "../src/app/(platform)/apps/[appId]/activity/page";
import {
  isAppRecordKnownDestination,
  visibleAppRecordGroups,
} from "../src/components/layout/app-record-nav.config";

const authState = vi.hoisted(() => ({ capabilities: [] as string[] }));

vi.mock("../src/components/auth/auth-provider", () => ({
  usePlatformAuth: () => ({
    session: {
      operator: { id: "op_1", email: "ops@example.com", displayName: "Ops" },
      capabilities: authState.capabilities,
    },
    loading: false,
    error: null,
    signOutFailed: false,
    refresh: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    forceSignOut: () => undefined,
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const APP: CatalogApp = {
  appId: "website-builder",
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

const TARGETING_EMPTY = {
  plans: [] as string[],
  industries: [] as string[],
  orgAllowlist: [] as string[],
  orgDenylist: [] as string[],
};

const CATALOG_CONTRACT = "2026-03";
const ROLLOUT_ITEM_NAME = "Rollout hero";
const OVERRIDE_TITLE = "Catalog override";
const EDIT_AVAILABILITY = "Edit availability";

function item(overrides: Partial<CatalogItem> & Pick<CatalogItem, "id" | "kind" | "name">): CatalogItem {
  return {
    scope: "GLOBAL",
    organizationId: null,
    slug: overrides.id,
    category: "marketing",
    industries: [],
    definition: {
      schemaVersion: CATALOG_CONTRACT,
      block: { id: "blk_" + overrides.id, type: "hero", props: { headline: overrides.name } },
    },
    previewRef: null,
    flagKey: null,
    targeting: TARGETING_EMPTY,
    status: "ACTIVE",
    contractVersion: CATALOG_CONTRACT,
    currentVersion: 3,
    draftVersion: null,
    concurrencyVersion: 2,
    previewedAt: null,
    publishedAt: "2026-11-10T10:00:00.000Z",
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-10T10:00:00.000Z",
    ...overrides,
  };
}

const SECTION = item({
  id: "item_section",
  kind: "SECTION",
  name: ROLLOUT_ITEM_NAME,
  flagKey: "catalog.hero",
  targeting: { ...TARGETING_EMPTY, plans: ["pro"] },
  previewedAt: "2026-11-09T09:00:00.000Z",
  draftVersion: 4,
});
const TEMPLATE = item({
  id: "item_template",
  kind: "TEMPLATE",
  name: "Harbour template",
  status: "DRAFT",
  currentVersion: 0,
  draftVersion: 1,
  publishedAt: null,
});
const THEME = item({
  id: "item_theme",
  kind: "THEME",
  name: "Warm stone",
  currentVersion: 2,
});
const UNSET = item({
  id: "item_unset",
  kind: "THEME",
  name: "Unpublished theme",
  currentVersion: 0,
  draftVersion: null,
  publishedAt: null,
});

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const roots: Root[] = [];
const initialApiUrl = process.env.NEXT_PUBLIC_API_URL;

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": status >= 400 ? "application/problem+json" : "application/json",
    },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function respond(url: string): Response {
  if (url.endsWith("/api/v1/admin/catalog/website-builder")) {
    return reply(200, { data: APP });
  }
  if (url.includes("kind=SECTION")) {
    return reply(200, { data: { items: [SECTION], nextCursor: null } });
  }
  if (url.includes("kind=TEMPLATE")) {
    return reply(200, { data: { items: [TEMPLATE], nextCursor: null } });
  }
  return reply(200, { data: { items: [THEME, UNSET], nextCursor: null } });
}

function installFetch(): void {
  fetchMock = vi.fn<typeof fetch>();
  fetchMock.mockImplementation(async (input) => {
    await Promise.resolve();
    return respond(requestUrl(input));
  });
  vi.stubGlobal("fetch", fetchMock);
}

function render(ui: React.ReactElement): void {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(ui));
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent.trim() === label,
  );
  if (button === undefined) {
    throw new Error("No button labelled " + label);
  }
  return button;
}

function withRecord(ui: React.ReactElement): React.ReactElement {
  return <AppRecordProvider value={{ app: APP, reload: () => undefined }}>{ui}</AppRecordProvider>;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  authState.capabilities = [PLATFORM_CAPABILITIES.APPS_READ.code];
  installFetch();
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  if (initialApiUrl === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
  } else {
    process.env.NEXT_PUBLIC_API_URL = initialApiUrl;
  }
});

describe("Application record destinations", () => {
  it("declares rollout and activity as separate routes", () => {
    const items = visibleAppRecordGroups([PLATFORM_CAPABILITIES.APPS_READ.code]).flatMap(
      (group) => group.items,
    );

    expect(items.map((entry) => entry.id)).toEqual([
      "overview",
      "settings",
      "sections",
      "templates",
      "themes",
      "rollout",
      "activity",
    ]);
    expect(items.find((entry) => entry.id === "rollout")?.segment).toBe("rollout");
    expect(items.find((entry) => entry.id === "activity")?.segment).toBe("activity");
    expect(isAppRecordKnownDestination("/apps/website-builder/rollout")).toBe(true);
    expect(isAppRecordKnownDestination("/apps/website-builder/activity")).toBe(true);
    expect(isAppRecordKnownDestination("/apps/website-builder/undeclared")).toBe(false);
  });

  it("hides both destinations from an operator without the read capability", () => {
    expect(visibleAppRecordGroups([])).toEqual([]);
  });
});

describe("New application record routes fail closed", () => {
  it("denies the rollout route without the read capability and makes no request", () => {
    authState.capabilities = [];
    const html = renderToString(withRecord(<AppRecordRolloutPage />));

    expect(html).toContain("Capability denied");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("denies the activity route without the read capability and makes no request", () => {
    authState.capabilities = [];
    const html = renderToString(withRecord(<AppRecordActivityPage />));

    expect(html).toContain("Capability denied");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Rollout destination", () => {
  it("shows the availability override and the targeting each catalog item declares", async () => {
    authState.capabilities = [
      PLATFORM_CAPABILITIES.APPS_READ.code,
      PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
    ];
    render(withRecord(<AppRecordRolloutPage />));
    await settle();

    expect(document.body.textContent).toContain("Rollout");
    expect(document.body.textContent).toContain("Available");
    expect(document.body.textContent).toContain("Installed tenants");
    expect(document.body.textContent).toContain(String(APP.installedCount));
    expect(document.body.textContent).toContain(ROLLOUT_ITEM_NAME);
    expect(document.body.textContent).toContain("Harbour template");
    expect(document.body.textContent).toContain("catalog.hero");
    expect(document.body.textContent).toContain("pro");
    expect(document.body.textContent).toContain(EDIT_AVAILABILITY);
  });

  it("surfaces the RFC 7807 detail when the rollout read fails", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        reply(429, {
          type: "/errors/rate-limited",
          title: "Too Many Requests",
          status: 429,
          detail: "The catalog read budget is exhausted.",
          code: "RATE_LIMITED",
        }),
      ),
    );
    render(withRecord(<AppRecordRolloutPage />));
    await settle();

    expect(document.body.textContent).toContain("Unable to load catalog rollout");
    expect(document.body.textContent).toContain("The catalog read budget is exhausted.");
  });

});

describe("Rollout availability control", () => {
  it("hides the availability editor from a read-only operator", async () => {
    render(withRecord(<AppRecordRolloutPage />));
    await settle();

    expect(document.body.textContent).toContain(ROLLOUT_ITEM_NAME);
    expect(document.body.textContent).not.toContain("Edit availability");
  });

  it("opens and cancels the availability override", async () => {
    authState.capabilities = [
      PLATFORM_CAPABILITIES.APPS_READ.code,
      PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
    ];
    render(withRecord(<AppRecordRolloutPage />));
    await settle();

    act(() => findButton(EDIT_AVAILABILITY).click());
    await settle();
    expect(document.body.textContent).toContain(OVERRIDE_TITLE);

    act(() => findButton("Cancel").click());
    await settle();
    expect(document.body.textContent).not.toContain(OVERRIDE_TITLE);
  });

  it("saves the availability override through the audited catalog mutation", async () => {
    authState.capabilities = [
      PLATFORM_CAPABILITIES.APPS_READ.code,
      PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
    ];
    render(withRecord(<AppRecordRolloutPage />));
    await settle();

    act(() => findButton(EDIT_AVAILABILITY).click());
    await settle();
    const form = document.querySelector("form");
    if (form === null) throw new Error("The availability form was not rendered");
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });
    await settle();

    const patch = fetchMock.mock.calls.find(
      ([, init]) => (init?.method ?? "GET").toUpperCase() === "PATCH",
    );
    expect(patch).toBeDefined();
    expect(document.body.textContent).not.toContain(OVERRIDE_TITLE);
    expect(document.body.textContent).toContain("Unpublished");
  });
});

describe("Activity destination", () => {
  it("shows the stored catalog timeline newest first", async () => {
    render(withRecord(<AppRecordActivityPage />));
    await settle();

    expect(document.body.textContent).toContain("Activity");
    expect(document.body.textContent).toContain(ROLLOUT_ITEM_NAME);
    expect(document.body.textContent).toContain("Published v3");
    expect(document.body.textContent).toContain("Draft saved v4");
    expect(document.body.textContent).toContain("Previewed v4");
    expect(document.body.textContent).toContain("Created");
  });

  it("renders a genuine empty state when the catalog has no items", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(reply(200, { data: { items: [], nextCursor: null } })),
    );
    render(withRecord(<AppRecordActivityPage />));
    await settle();

    expect(document.body.textContent).toContain("No catalog activity yet");
  });
});
