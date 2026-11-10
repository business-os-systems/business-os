// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import AppCatalogPage from "../src/app/(platform)/apps/page";
import { CatalogOverrideModal } from "../src/app/(platform)/apps/catalog-override-modal";
import { PlatformShell } from "../src/components/layout/platform-shell";
import {
  canAccessPath,
  visibleNavigation,
} from "../src/components/layout/navigation.config";
import {
  CapabilityDeniedView,
  PlatformViewState,
} from "../src/components/states/view-state";
import {
  CATALOG_TABLE_CONFIG,
  buildCatalogOverrideBody,
  toCatalogOverrideFormValues,
  validateCatalogOverrideForm,
} from "../src/components/apps/apps.config";
import { ConfigTable } from "../src/components/tables/config-table";
import { IDEMPOTENCY_HEADER } from "../src/lib/api";
import type { CatalogApp } from "../src/lib/apps-api";

const authState = vi.hoisted(() => ({ capabilities: [] as string[] }));
const navState = vi.hoisted(() => ({
  pathname: "/apps",
  params: { orgId: "org_1" },
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({
    push: navState.push,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useParams: () => navState.params,
  useSearchParams: () => new URLSearchParams(),
}));

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

const APP: CatalogApp = {
  appId: "website-builder",
  name: "Website Builder",
  title: "Website Builder & Headless CMS",
  description: "Visual canvas studio.",
  category: null,
  availability: "AVAILABLE",
  sortOrder: 0,
  installedCount: 2,
  version: "2026-11-07T10:00:00.000000Z",
  updatedAt: "2026-11-07T10:00:00.000Z",
};

const VIEW_PROBLEM = {
  type: "/errors/rate-limited",
  title: "Too Many Requests",
  status: 429,
  detail: "The catalog read budget is exhausted.",
  code: "RATE_LIMITED",
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

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestJsonBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") {
    throw new Error("Expected a JSON request body");
  }
  return JSON.parse(init.body);
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
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setInputValue(element: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
    element,
    value
  );
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  authState.capabilities = [];
  navState.push.mockReset();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("App catalog capability gate", () => {
  it("hides the destination and denies a direct visit", () => {
    expect(
      visibleNavigation([PLATFORM_CAPABILITIES.TENANTS_READ.code]).map(
        (item) => item.id
      )
    ).not.toContain("apps");
    expect(
      visibleNavigation([PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code]).map(
        (item) => item.id
      )
    ).toContain("apps");
    expect(
      visibleNavigation([PLATFORM_CAPABILITIES.APPS_READ.code]).map(
        (item) => item.id
      )
    ).toContain("apps");
    expect(canAccessPath([], "/apps")).toBe(false);
    expect(
      canAccessPath([PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code], "/apps")
    ).toBe(true);
    expect(
      canAccessPath([PLATFORM_CAPABILITIES.APPS_READ.code], "/apps")
    ).toBe(true);
    expect(renderToString(<AppCatalogPage />)).toContain("Capability denied");
    expect(
      renderToString(<CapabilityDeniedView message="No catalog access." />)
    ).toContain("Capability denied");
  });

  it("denies the shell direct visit without the capability", () => {
    const shell = renderToString(
      <PlatformShell>
        <h1>Catalog</h1>
      </PlatformShell>
    );
    expect(shell).toContain("Access denied");
    expect(shell).not.toContain("Catalog</h1>");
  });
});

describe("App catalog states", () => {
  it("renders the loading state before the catalog arrives", () => {
    authState.capabilities = [PLATFORM_CAPABILITIES.APPS_READ.code];
    expect(renderToString(<AppCatalogPage />)).toContain(
      "Loading the application catalog"
    );
  });

  it("renders the empty state for an empty registry projection", async () => {
    authState.capabilities = [PLATFORM_CAPABILITIES.APPS_READ.code];
    fetchMock.mockResolvedValueOnce(reply(200, { data: { apps: [] } }));
    render(<AppCatalogPage />);
    await settle();
    expect(document.body.textContent).toContain(
      "No applications in the catalog"
    );
  });

  it("does not render an aborted first request as an error", async () => {
    authState.capabilities = [PLATFORM_CAPABILITIES.APPS_READ.code];
    const aborted = Object.assign(new Error("aborted"), { name: "AbortError" });
    fetchMock.mockImplementationOnce(() => Promise.reject(aborted));
    render(<AppCatalogPage />);
    await settle();
    expect(document.body.textContent).not.toContain("signal is aborted");
    expect(document.body.textContent).not.toContain("REQUEST FAILED");
    expect(document.body.textContent).toContain(
      "Loading the application catalog"
    );
  });

  it("renders the RFC 7807 error detail and code", async () => {
    authState.capabilities = [PLATFORM_CAPABILITIES.APPS_READ.code];
    fetchMock.mockResolvedValueOnce(reply(429, VIEW_PROBLEM));
    render(<AppCatalogPage />);
    await settle();
    expect(document.body.textContent).toContain(VIEW_PROBLEM.detail);
    expect(document.body.textContent).toContain(VIEW_PROBLEM.code);
  });

  it("navigates from a catalog row into the application record", async () => {
    authState.capabilities = [PLATFORM_CAPABILITIES.APPS_READ.code];
    fetchMock.mockResolvedValueOnce(reply(200, { data: { apps: [APP] } }));
    render(<AppCatalogPage />);
    await settle();

    const open = [...document.querySelectorAll("button")].find((button) =>
      button.textContent.includes(APP.title)
    );
    if (open === undefined) throw new Error("The row target was not rendered");
    act(() => open.click());

    expect(navState.push).toHaveBeenCalledWith(
      "/apps/website-builder/overview"
    );
  });
});

const EDIT_OVERRIDE_LABEL = "Edit override";
const OVERRIDE_CAPABILITIES = [
  PLATFORM_CAPABILITIES.APPS_READ.code,
  PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
];

function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((button) =>
    button.textContent.includes(label)
  );
}

async function openOverrideEditor(): Promise<HTMLFormElement> {
  authState.capabilities = [...OVERRIDE_CAPABILITIES];
  render(<AppCatalogPage />);
  await settle();

  const edit = findButton(EDIT_OVERRIDE_LABEL);
  if (edit === undefined) throw new Error("The override action was not rendered");
  act(() => edit.click());
  await settle();

  const form = document.querySelector("form");
  if (form === null) throw new Error("The override form was not rendered");
  return form;
}

async function submitOverride(form: HTMLFormElement): Promise<void> {
  await act(async () => {
    form.requestSubmit();
    await Promise.resolve();
  });
  await settle();
}

describe("App catalog row actions", () => {
  it("keeps the override action for an entitlement manager", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { data: { apps: [APP] } }));
    await openOverrideEditor();

    expect(document.body.textContent).toContain("Catalog override");
    expect(document.body.textContent).toContain(APP.title);
  });
});

describe("App catalog override lifecycle", () => {
  it("closes and reloads after saving an override", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { data: { apps: [APP] } }))
      .mockResolvedValueOnce(reply(200, { data: { ...APP, sortOrder: 1 } }))
      .mockResolvedValueOnce(reply(200, { data: { apps: [APP] } }));
    const form = await openOverrideEditor();
    await submitOverride(form);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(document.body.textContent).not.toContain("Catalog override");
  });

  it("closes and reloads after a stale override", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { data: { apps: [APP] } }))
      .mockResolvedValueOnce(
        reply(409, {
          type: "/errors/version-conflict",
          title: "Resource Conflict",
          status: 409,
          detail: "The catalog override changed since it was observed.",
          code: "VERSION_CONFLICT",
        })
      )
      .mockResolvedValueOnce(reply(200, { data: { apps: [APP] } }));
    const form = await openOverrideEditor();
    await submitOverride(form);

    const reload = findButton("Reload catalog");
    if (reload === undefined) throw new Error("The reload action was not rendered");
    act(() => reload.click());
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(document.body.textContent).not.toContain("Catalog override");
  });
});

describe("App catalog row action authorization", () => {
  it("hides the override action from a read-only operator", async () => {
    authState.capabilities = [PLATFORM_CAPABILITIES.APPS_READ.code];
    fetchMock.mockResolvedValueOnce(reply(200, { data: { apps: [APP] } }));
    render(<AppCatalogPage />);
    await settle();

    expect(findButton(EDIT_OVERRIDE_LABEL)).toBeUndefined();
  });
});

describe("App catalog table and shared view state", () => {
  it("renders availability, order and installed count from the table config", () => {
    const html = renderToString(
      <ConfigTable
        config={CATALOG_TABLE_CONFIG}
        rows={[APP]}
        state={{ kind: "ready" }}
        rowKey={(row) => row.appId}
        rowLabel={(row) => row.title}
      />
    );
    expect(html).toContain("Website Builder &amp; Headless CMS");
    expect(html).toContain("Available");
    expect(html).toContain("text-success");
    expect(html).toContain("2");
  });

  it("renders the shared view state for empty and error states", () => {
    expect(
      renderToString(
        <PlatformViewState
          state={{
            kind: "empty",
            title: "Nothing here",
            description: "No records.",
          }}
        />
      )
    ).toContain("Nothing here");
    expect(
      renderToString(
        <PlatformViewState
          state={{
            kind: "error",
            problem: {
              status: 429,
              title: VIEW_PROBLEM.title,
              detail: VIEW_PROBLEM.detail,
              code: VIEW_PROBLEM.code,
              requestId: "req_1",
              invalidParams: [{ name: "availability", reason: "Required" }],
            },
          }}
        />
      )
    ).toContain("availability");
  });
});

describe("Catalog override form", () => {
  it("validates the order, category and availability", () => {
    expect(
      validateCatalogOverrideForm({
        availability: "AVAILABLE",
        sortOrder: "10001",
        category: "Not A Slug",
      })
    ).toEqual({
      sortOrder: "Use a whole number between 0 and 10000.",
      category: "Use a lower-case slug: letters, digits, underscore or hyphen.",
    });
    expect(
      buildCatalogOverrideBody(
        { availability: "PREVIEW", sortOrder: " 12 ", category: "" },
        null
      )
    ).toEqual({
      availability: "PREVIEW",
      sortOrder: 12,
      category: null,
      expectedVersion: null,
    });
    expect(toCatalogOverrideFormValues(APP).availability).toBe("AVAILABLE");
  });

});

describe("Catalog override mutations", () => {
  it("sends expectedVersion and an idempotency key", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, { data: { ...APP, sortOrder: 25 } })
    );
    const onSaved = vi.fn();
    render(
      <CatalogOverrideModal
        app={APP}
        onClose={() => undefined}
        onSaved={onSaved}
        onReload={() => undefined}
      />
    );
    const input = document.querySelector("input");
    const form = document.querySelector("form");
    if (input === null || form === null) throw new Error("Override form missing");
    act(() => setInputValue(input, "25"));
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });

    const call = fetchMock.mock.calls[0];
    if (call === undefined) throw new Error("The API was not called");
    expect(requestUrl(call[0])).toBe(
      "http://api.test/api/v1/admin/catalog/website-builder"
    );
    expect(call[1]?.method).toBe("PATCH");
    expect(new Headers(call[1]?.headers).get(IDEMPOTENCY_HEADER)).toMatch(
      /^[0-9a-f-]{36}$/
    );
    expect(requestJsonBody(call[1])).toEqual({
      availability: "AVAILABLE",
      sortOrder: 25,
      category: null,
      expectedVersion: APP.version,
    });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 25 }));
  });

});

describe("Catalog override server validation", () => {
  it("surfaces an RFC 7807 validation detail", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(422, {
        type: "/errors/unknown-app",
        title: "Validation Failed",
        status: 422,
        detail: "The application is not registered in the platform catalog.",
        code: "UNKNOWN_APP",
        invalidParams: [
          { name: "sortOrder", reason: "Use a whole number between 0 and 10000." },
        ],
      })
    );
    render(
      <CatalogOverrideModal
        app={APP}
        onClose={() => undefined}
        onSaved={() => undefined}
        onReload={() => undefined}
      />
    );
    const form = document.querySelector("form");
    if (form === null) throw new Error("Override form missing");
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain(
      "The application is not registered in the platform catalog."
    );
    expect(document.body.textContent).toContain(
      "Use a whole number between 0 and 10000."
    );
  });

});

describe("Catalog override conflicts", () => {
  it("surfaces a 409 conflict without applying the change", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(409, {
        type: "/errors/version-conflict",
        title: "Resource Conflict",
        status: 409,
        detail: "The catalog override changed since it was observed.",
        code: "VERSION_CONFLICT",
      })
    );
    const onSaved = vi.fn();
    render(
      <CatalogOverrideModal
        app={APP}
        onClose={() => undefined}
        onSaved={onSaved}
        onReload={() => undefined}
      />
    );
    const form = document.querySelector("form");
    if (form === null) throw new Error("Override form missing");
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain(
      "The catalog override changed since it was observed."
    );
    expect(document.body.textContent).toContain("Reload catalog");
    expect(onSaved).not.toHaveBeenCalled();
  });
});
