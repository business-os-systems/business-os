// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import CatalogsLayout from "../src/app/(platform)/catalogs/layout";
import CatalogPage from "../src/app/(platform)/catalogs/[category]/page";
import {
  CATALOGS_NAV_ITEMS,
  isCatalogsHubRoute,
  visibleCatalogsNavItems,
} from "../src/components/layout/catalogs-nav.config";
import {
  canAccessPath,
  requiredCapabilityForPath,
} from "../src/components/layout/navigation.config";
import {
  sortCatalogValues,
  withCatalogValue,
} from "../src/components/catalogs/catalogs.config";
import type { Catalog, CatalogValue } from "../src/lib/catalogs-api";

const authState = vi.hoisted(() => ({ capabilities: [] as string[] }));
const navState = vi.hoisted(() => ({
  pathname: "/catalogs/currency",
  params: { category: "currency" },
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({
    replace: navState.replace,
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  useParams: () => navState.params,
  useSearchParams: () => new URLSearchParams(),
}));

const CURRENCIES_HREF = "/catalogs/currency";
const SORT_ORDER_INPUT = "-sortOrder";
const SORT_ORDER_TEN = "10";
const EDITED_LABEL = "Indian Rupee (updated)";

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

function value(
  overrides: Partial<CatalogValue> & Pick<CatalogValue, "code">,
): CatalogValue {
  return {
    catalogKey: "currency",
    code: overrides.code,
    label: overrides.label ?? overrides.code,
    sortOrder: overrides.sortOrder ?? 10,
    isActive: overrides.isActive ?? true,
    metadata: overrides.metadata ?? {},
    version: overrides.version ?? 1,
    createdAt: "2026-11-09T10:00:00.000Z",
    updatedAt: "2026-11-09T10:00:00.000Z",
  };
}

const CATALOG: Catalog = {
  key: "currency",
  label: "Currencies",
  description: "ISO 4217 currency codes used for money and pricing.",
  isSystem: true,
  values: [
    value({ code: "INR", label: "Indian Rupee", sortOrder: 10 }),
    value({ code: "USD", label: "US Dollar", sortOrder: 20, isActive: false, version: 3 }),
  ],
};

const READ_PROBLEM = {
  type: "/errors/rate-limited",
  title: "Too Many Requests",
  status: 429,
  detail: "The catalog read budget is exhausted.",
  code: "RATE_LIMITED",
};

const DUPLICATE_PROBLEM = {
  type: "/errors/duplicate-code",
  title: "Resource Conflict",
  status: 409,
  detail: 'The reference value "INR" already exists in the currency catalog.',
  code: "DUPLICATE_CODE",
};

const VERSION_CONFLICT = {
  type: "/errors/catalog-version-conflict",
  title: "Conflict",
  status: 409,
  detail: "The reference value changed since it was observed. Reload the catalog and retry.",
  code: "CATALOG_VERSION_CONFLICT",
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const roots: Root[] = [];
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type":
        status >= 400 ? "application/problem+json" : "application/json",
    },
  });

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

function setInput(idSuffix: string, next: string): void {
  const element = document.querySelector<HTMLInputElement>(
    `input[id$="${idSuffix}"]`,
  );
  if (element === null) {
    throw new Error(`No input ending in ${idSuffix}`);
  }
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(element, next);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function clickButton(label: string): void {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent.trim() === label,
  );
  if (button === undefined) {
    throw new Error(`No button labelled ${label}`);
  }
  act(() => button.click());
}

function clickFirstRow(): void {
  const button = document.querySelector("tbody button");
  if (button === null) {
    throw new Error("No table row to open");
  }
  act(() => (button as HTMLButtonElement).click());
}

function submitForm(): void {
  const form = document.querySelector("form");
  if (form === null) {
    throw new Error("No form to submit");
  }
  act(() => form.requestSubmit());
}

function requestBody(init: RequestInit | undefined): string {
  if (typeof init?.body !== "string") {
    throw new Error("Expected a JSON request body");
  }
  return init.body;
}

function requestCount(method: string): number {
  return fetchMock.mock.calls.filter(
    ([, init]) => (init?.method ?? "GET").toUpperCase() === method,
  ).length;
}

function renderScreen(): void {
  render(
    <CatalogsLayout>
      <CatalogPage />
    </CatalogsLayout>,
  );
}

async function renderLoaded(): Promise<void> {
  renderScreen();
  await settle();
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  authState.capabilities = [PLATFORM_CAPABILITIES.CATALOGS_MANAGE.code];
  navState.pathname = CURRENCIES_HREF;
  navState.params = { category: "currency" };
  fetchMock = vi.fn<typeof fetch>();
  fetchMock.mockResolvedValue(reply(200, { data: { catalogs: [CATALOG] } }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const CATALOGS_CAPABILITY = PLATFORM_CAPABILITIES.CATALOGS_MANAGE.code;

describe("Catalogs hub routing and capability gate", () => {
  it("declares every catalog as a route and hides them without the capability", () => {
    expect(visibleCatalogsNavItems([CATALOGS_CAPABILITY])).toHaveLength(
      CATALOGS_NAV_ITEMS.length,
    );
    expect(visibleCatalogsNavItems([])).toEqual([]);
    expect(isCatalogsHubRoute(CURRENCIES_HREF)).toBe(true);
    expect(isCatalogsHubRoute("/tenants/org_1")).toBe(false);
    expect(requiredCapabilityForPath(CURRENCIES_HREF)).toBe(
      CATALOGS_CAPABILITY,
    );
    expect(canAccessPath([], CURRENCIES_HREF)).toBe(false);
    expect(canAccessPath([CATALOGS_CAPABILITY], CURRENCIES_HREF)).toBe(true);
  });

  it("denies a direct visit to the hub without the capability", () => {
    authState.capabilities = [];
    expect(
      renderToString(
        <CatalogsLayout>
          <div>catalog content</div>
        </CatalogsLayout>,
      ),
    ).toContain("Capability denied");
  });
});

describe("Catalogs hub states", () => {
  it("renders the loading state before the catalogs arrive", () => {
    expect(
      renderToString(
        <CatalogsLayout>
          <div>catalog content</div>
        </CatalogsLayout>,
      ),
    ).toContain("Loading reference catalogs");
  });

  it("renders the RFC 7807 detail and code when the read fails", async () => {
    fetchMock.mockResolvedValueOnce(reply(429, READ_PROBLEM));
    await renderLoaded();
    expect(document.body.textContent).toContain(READ_PROBLEM.detail);
    expect(document.body.textContent).toContain(READ_PROBLEM.code);
  });

  it("renders every catalog as a sidebar route and the panel for the URL", async () => {
    await renderLoaded();
    expect(
      document.querySelector(`a[href="${CURRENCIES_HREF}"]`),
    ).not.toBeNull();
    expect(document.querySelector('a[href="/catalogs/country"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Retired");
    expect(document.body.textContent).toContain("Active");
  });
});

describe("Catalog value validation", () => {
  it("rejects an invalid format before sending the request", async () => {
    await renderLoaded();
    clickButton("Add value");
    setInput("-code", "US");
    setInput("-label", "United States Dollar");
    setInput(SORT_ORDER_INPUT, SORT_ORDER_TEN);
    submitForm();
    await settle();

    expect(document.body.textContent).toContain(
      "Currency codes must be three ISO 4217 letters.",
    );
    expect(requestCount("POST")).toBe(0);
  });

  it("shows a duplicate-code detail without offering a reload", async () => {
    fetchMock.mockImplementation((_input, init) => {
      if ((init?.method ?? "GET").toUpperCase() === "POST") {
        return Promise.resolve(reply(409, DUPLICATE_PROBLEM));
      }
      return Promise.resolve(reply(200, { data: { catalogs: [CATALOG] } }));
    });
    await renderLoaded();
    clickButton("Add value");
    setInput("-code", "INR");
    setInput("-label", "Indian Rupee");
    setInput(SORT_ORDER_INPUT, SORT_ORDER_TEN);
    submitForm();
    await settle();

    expect(document.body.textContent).toContain(DUPLICATE_PROBLEM.detail);
    expect(document.body.textContent).not.toContain("Reload catalog");
  });
});

describe("Catalog value conflicts", () => {
  it("requires the code before retiring and surfaces the version conflict", async () => {
    await renderLoaded();
    clickButton("Retire");

    setInput("-confirmation", "NOT-INR");
    submitForm();
    await settle();
    expect(requestCount("PATCH")).toBe(0);
    expect(document.body.textContent).toContain("Type INR exactly to confirm");

    fetchMock.mockResolvedValueOnce(reply(409, VERSION_CONFLICT));
    setInput("-confirmation", "INR");
    submitForm();
    await settle();

    expect(document.body.textContent).toContain(VERSION_CONFLICT.detail);
    expect(document.body.textContent).toContain("Reload catalog");
  });
});

describe("Catalog create", () => {
  it("creates a normalized value in the selected catalog", async () => {
    const created = value({ code: "GBP", label: "Pound Sterling", sortOrder: 30 });
    fetchMock.mockImplementation((_input, init) => {
      if ((init?.method ?? "GET").toUpperCase() === "POST") {
        return Promise.resolve(reply(200, { data: created }));
      }
      return Promise.resolve(reply(200, { data: { catalogs: [CATALOG] } }));
    });

    await renderLoaded();
    clickButton("Add value");
    setInput("-code", "gbp");
    setInput("-label", "Pound Sterling");
    setInput(SORT_ORDER_INPUT, "30");
    submitForm();
    await settle();

    const post = fetchMock.mock.calls.find(
      ([, init]) => (init?.method ?? "GET").toUpperCase() === "POST",
    );
    expect(JSON.parse(requestBody(post?.[1]))).toEqual({
      code: "GBP",
      label: "Pound Sterling",
      sortOrder: 30,
    });
    expect(document.body.textContent).toContain("GBP");
  });

});

describe("Catalog edit", () => {
  it("edits a value through the row action", async () => {
    const edited = value({ code: "INR", label: EDITED_LABEL, sortOrder: 15, version: 2 });
    fetchMock.mockImplementation((_input, init) => {
      if ((init?.method ?? "GET").toUpperCase() === "PATCH") {
        return Promise.resolve(reply(200, { data: edited }));
      }
      return Promise.resolve(reply(200, { data: { catalogs: [CATALOG] } }));
    });

    await renderLoaded();
    clickFirstRow();
    setInput("-label", EDITED_LABEL);
    setInput(SORT_ORDER_INPUT, "15");
    submitForm();
    await settle();

    const patch = fetchMock.mock.calls.find(
      ([, init]) => (init?.method ?? "GET").toUpperCase() === "PATCH",
    );
    expect(JSON.parse(requestBody(patch?.[1]))).toEqual({
      label: EDITED_LABEL,
      sortOrder: 15,
      expectedVersion: 1,
    });
    expect(document.body.textContent).toContain(EDITED_LABEL);
  });

});

describe("Catalog reactivate", () => {
  it("reactivates a retired value without a typed confirmation", async () => {
    const reactivated = value({ code: "USD", label: "US Dollar", sortOrder: 20, version: 4 });
    fetchMock.mockImplementation((_input, init) => {
      if ((init?.method ?? "GET").toUpperCase() === "PATCH") {
        return Promise.resolve(reply(200, { data: reactivated }));
      }
      return Promise.resolve(reply(200, { data: { catalogs: [CATALOG] } }));
    });

    await renderLoaded();
    clickButton("Reactivate");
    submitForm();
    await settle();

    const patch = fetchMock.mock.calls.find(
      ([, init]) => (init?.method ?? "GET").toUpperCase() === "PATCH",
    );
    expect(JSON.parse(requestBody(patch?.[1]))).toEqual({
      isActive: true,
      expectedVersion: 3,
    });
    expect(document.body.textContent).not.toContain("Reactivate");
  });
});

describe("Catalog ordering helpers", () => {
  it("sorts by order, label and code and upserts a value once", () => {
    const first = value({ code: "B", label: "Beta", sortOrder: 1 });
    const second = value({ code: "A", label: "Alpha", sortOrder: 1 });
    expect(sortCatalogValues([first, second]).map((item) => item.code)).toEqual([
      "A",
      "B",
    ]);

    const next = value({ code: "A", label: "Alpha updated", sortOrder: 1, version: 2 });
    const updated = withCatalogValue({ ...CATALOG, values: [first, second] }, next);
    expect(updated.values).toHaveLength(2);
    expect(updated.values.find((item) => item.code === "A")?.label).toBe(
      "Alpha updated",
    );
  });
});
