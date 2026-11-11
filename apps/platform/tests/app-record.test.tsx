// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import type { CatalogApp } from "../src/lib/apps-api";
import type { CatalogItem } from "../src/lib/catalog-api";
import { validateCatalogDraft } from "../src/lib/catalog-schema";
import { AppRecordProvider } from "../src/app/(platform)/apps/[appId]/app-record-context";
import CatalogSectionsPage from "../src/app/(platform)/apps/[appId]/sections/page";
import CatalogTemplatesPage from "../src/app/(platform)/apps/[appId]/templates/page";
import CatalogThemesPage from "../src/app/(platform)/apps/[appId]/themes/page";
import { CatalogPreviewPanel } from "../src/components/catalog/catalog-preview-panel";

const authState = vi.hoisted(() => ({ capabilities: [] as string[] }));
const navState = vi.hoisted(() => ({
  pathname: "/apps/website-builder/sections",
  params: { appId: "website-builder", itemId: "item_section_1" },
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({ push: navState.push, replace: vi.fn(), refresh: vi.fn() }),
  useParams: () => navState.params,
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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  version: null,
  updatedAt: null,
};

const HERO_BLOCK = {
  id: "blk_hero",
  type: "hero",
  props: { headline: "Restaurant hero headline" },
};

function catalogItem(overrides: Partial<CatalogItem> & Pick<CatalogItem, "id" | "kind">): CatalogItem {
  return {
    scope: "GLOBAL",
    organizationId: null,
    name: "Restaurant hero",
    slug: "restaurant-hero",
    category: "hospitality",
    industries: ["hospitality"],
    definition: { schemaVersion: "2026-03", block: HERO_BLOCK },
    previewRef: null,
    flagKey: null,
    targeting: { plans: [], industries: [], orgAllowlist: [], orgDenylist: [] },
    status: "ACTIVE",
    contractVersion: "2026-03",
    currentVersion: 3,
    draftVersion: 4,
    concurrencyVersion: 7,
    previewedAt: null,
    publishedAt: "2026-11-01T10:00:00.000Z",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-11-02T10:00:00.000Z",
    ...overrides,
  };
}

const SECTION_ITEM = catalogItem({ id: "item_section_1", kind: "SECTION" });
const DRAFT_ITEM = catalogItem({
  id: "item_section_2",
  kind: "SECTION",
  name: "Draft feature grid",
  slug: "draft-feature-grid",
  status: "DRAFT",
  currentVersion: 0,
  draftVersion: 1,
  concurrencyVersion: 2,
  publishedAt: null,
});

const PREVIEW_PROBLEM = {
  type: "/errors/preview-required",
  title: "Preview Required",
  status: 409,
  code: "PREVIEW_REQUIRED",
  detail: "Preview the current draft before publishing it.",
};

const NOT_FOUND = {
  type: "/errors/not-found",
  title: "Resource Not Found",
  status: 404,
  code: "NOT_FOUND",
  detail: "The catalog item could not be found.",
};

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let items: CatalogItem[];
let itemResponse: CatalogItem;
let previewResponse: Response;
let publishResponse: Response;
const roots: Root[] = [];

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": status >= 400 ? "application/problem+json" : "application/json",
    },
  });
}

function previewSuccess(version: number): Response {
  return reply(200, {
    data: {
      previewRef: "pvw.preview.signature",
      expiresAt: "2026-11-11T23:59:59.000Z",
      version,
      definitionHash: "a".repeat(64),
    },
  });
}

type MockRoute = "list" | "item" | "preview" | "publish" | "create" | "update" | "unknown";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function classifyRoute(method: string, url: string): MockRoute {
  if (method === "GET") {
    return url.includes("/items?") ? "list" : "item";
  }
  if (url.endsWith("/preview")) {
    return "preview";
  }
  if (url.endsWith("/publish")) {
    return "publish";
  }
  if (url.endsWith("/items")) {
    return "create";
  }
  return method === "PATCH" ? "update" : "unknown";
}

function parseBody(init: RequestInit | undefined): Partial<CatalogItem> {
  if (typeof init?.body !== "string") {
    return {};
  }
  return JSON.parse(init.body) as Partial<CatalogItem>;
}

function respond(route: MockRoute, url: string, init: RequestInit | undefined): Response {
  switch (route) {
    case "list": {
      const status = new URL(url).searchParams.get("status");
      const page = status === null ? items : items.filter((item) => item.status === status);
      return reply(200, { data: { items: page, nextCursor: null } });
    }
    case "item":
      return reply(200, { data: itemResponse });
    case "preview":
      return previewResponse;
    case "publish":
      return publishResponse;
    case "create": {
      const created = catalogItem({
        ...parseBody(init),
        id: "item_created",
        kind: "SECTION",
        status: "DRAFT",
        currentVersion: 0,
        draftVersion: 1,
        publishedAt: null,
      });
      return reply(201, { data: created });
    }
    case "update":
      return reply(200, { data: itemResponse });
    case "unknown":
      return reply(404, NOT_FOUND);
  }
}

function installFetch(): void {
  fetchMock = vi.fn<typeof fetch>();
  fetchMock.mockImplementation(async (input, init) => {
    await Promise.resolve();
    const method = (init?.method ?? "GET").toUpperCase();
    const url = requestUrl(input);
    return respond(classifyRoute(method, url), url, init);
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

function renderPage(page: React.ReactElement): void {
  render(<AppRecordProvider value={{ app: APP, reload: () => undefined }}>{page}</AppRecordProvider>);
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
    throw new Error(`No button labelled ${label}`);
  }
  return button;
}

function clickButton(label: string): void {
  act(() => findButton(label).click());
}

function setInput(id: string, value: string): void {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`No input ${id}`);
  }
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function setTextarea(label: string, value: string): void {
  const element = document.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${label}"]`);
  if (element === null) {
    throw new Error(`No textarea labelled ${label}`);
  }
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function selectOption(triggerId: string, label: string): void {
  const trigger = document.getElementById(triggerId);
  if (!(trigger instanceof HTMLButtonElement)) {
    throw new Error(`No select trigger ${triggerId}`);
  }
  act(() => trigger.click());
  const option = Array.from(document.querySelectorAll('[role="option"]')).find(
    (candidate) => candidate.textContent.trim() === label,
  );
  if (!(option instanceof HTMLElement)) {
    throw new Error(`No option labelled ${label}`);
  }
  act(() => option.click());
}

function requestBodies(method: string): string[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init?.method ?? "GET").toUpperCase() === method)
    .map(([, init]) => (typeof init?.body === "string" ? init.body : ""));
}

function requests(method: string): number {
  return requestBodies(method).length;
}

function lastRequestUrl(): string {
  const call = fetchMock.mock.calls.at(-1);
  return call === undefined ? "" : requestUrl(call[0]);
}

function openNewSection(): void {
  clickButton("New section");
}

function fillSectionMetadata(name: string, slug: string): void {
  setInput("catalog-section-form-name", name);
  setInput("catalog-section-form-slug", slug);
  setInput("catalog-section-form-category", "hospitality");
}

const JSON_LABEL = "Catalog record JSON";
const SAVE_DRAFT = "Save draft";

function readJsonDraft(): Record<string, unknown> {
  const element = document.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${JSON_LABEL}"]`);
  if (element === null) {
    throw new Error("No JSON textarea");
  }
  const value: unknown = JSON.parse(element.value);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Draft JSON is not an object");
  }
  return value as Record<string, unknown>;
}

function writeJsonDraft(mutate: (draft: Record<string, unknown>) => Record<string, unknown>): void {
  setTextarea(JSON_LABEL, JSON.stringify(mutate(readJsonDraft()), null, 2));
}

function previewFrame(): HTMLElement {
  const frame = document.querySelector<HTMLElement>('[data-testid="catalog-preview-frame"]');
  if (frame === null) {
    throw new Error("No preview frame");
  }
  return frame;
}

async function renderPreview(): Promise<void> {
  render(<CatalogPreviewPanel />);
  await settle();
  await settle();
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  authState.capabilities = [PLATFORM_CAPABILITIES.APPS_READ.code];
  navState.pathname = `/apps/${APP_ID}/sections`;
  navState.params = { appId: APP_ID, itemId: SECTION_ITEM.id };
  navState.push.mockReset();
  items = [SECTION_ITEM, DRAFT_ITEM];
  itemResponse = SECTION_ITEM;
  previewResponse = previewSuccess(4);
  publishResponse = reply(200, { data: { ...SECTION_ITEM, status: "ACTIVE", draftVersion: null, currentVersion: 4 } });
  installFetch();
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("Catalog list panels", () => {
  it("lists sections from the API and filters by status", async () => {
    renderPage(<CatalogSectionsPage />);
    await settle();
    expect(document.body.textContent).toContain("Restaurant hero");
    expect(document.body.textContent).toContain("Draft feature grid");

    selectOption("catalog-status-filter", "Draft");
    await settle();

    expect(document.body.textContent).toContain("Draft feature grid");
    expect(document.body.textContent).not.toContain("Restaurant hero");
    expect(lastRequestUrl()).toContain("status=DRAFT");
  });

  it("requests the right kind for sections, templates and themes", async () => {
    renderPage(<CatalogSectionsPage />);
    renderPage(<CatalogTemplatesPage />);
    renderPage(<CatalogThemesPage />);
    await settle();
    const urls = fetchMock.mock.calls.map(([input]) => requestUrl(input));
    expect(urls.some((url) => url.includes("kind=SECTION"))).toBe(true);
    expect(urls.some((url) => url.includes("kind=TEMPLATE"))).toBe(true);
    expect(urls.some((url) => url.includes("kind=THEME"))).toBe(true);
  });

  it("denies the panel without the read capability and makes no request", async () => {
    authState.capabilities = [];
    renderPage(<CatalogSectionsPage />);
    await settle();
    expect(document.body.textContent).toContain("Capability denied");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hides authoring and lifecycle actions from a read-only operator", async () => {
    renderPage(<CatalogSectionsPage />);
    await settle();
    expect(document.body.textContent).toContain("Preview");
    expect(document.body.textContent).not.toContain("New section");
    expect(document.body.textContent).not.toContain("Edit");
    expect(document.body.textContent).not.toContain("Deprecate");
    expect(document.body.textContent).not.toContain("Retire");
  });
});

describe("Generated catalog form", () => {
  beforeEach(() => {
    authState.capabilities = [
      PLATFORM_CAPABILITIES.APPS_READ.code,
      PLATFORM_CAPABILITIES.APPS_AUTHOR.code,
    ];
  });

  it("validates the generated form before sending a request", async () => {
    renderPage(<CatalogSectionsPage />);
    await settle();
    openNewSection();
    await settle();
    fillSectionMetadata("Parity section", "Bad Slug");
    clickButton(SAVE_DRAFT);
    await settle();
    expect(document.body.textContent).toContain("Use a lower-case slug");
    expect(requests("POST")).toBe(0);
  });

  it("rejects an undeclared property in the JSON tab", async () => {
    renderPage(<CatalogSectionsPage />);
    await settle();
    openNewSection();
    await settle();
    clickButton("JSON");
    writeJsonDraft((draft) => ({ ...draft, undeclared: true }));
    clickButton("Apply JSON");
    await settle();
    expect(document.body.textContent).toContain("Undeclared property");
    clickButton(SAVE_DRAFT);
    await settle();
    expect(requests("POST")).toBe(0);
  });

  it("produces the same validated structure from the form and the JSON tab", async () => {
    renderPage(<CatalogSectionsPage />);
    await settle();
    openNewSection();
    await settle();
    fillSectionMetadata("Parity section", "parity-section");
    clickButton(SAVE_DRAFT);
    await settle();
    const fromForm = requestBodies("POST")[0];

    openNewSection();
    await settle();
    clickButton("JSON");
    writeJsonDraft((draft) => ({
      ...draft,
      name: "Parity section",
      slug: "parity-section",
      category: "hospitality",
    }));
    clickButton("Apply JSON");
    await settle();
    clickButton(SAVE_DRAFT);
    await settle();
    const fromJson = requestBodies("POST")[1];
    expect(fromJson).toBeDefined();
    expect(JSON.parse(fromJson ?? "{}")).toEqual(JSON.parse(fromForm ?? "{}"));
  });
});

describe("Catalog validation boundary", () => {
  it("rejects reserved theme token keys", () => {
    const tokens: unknown = JSON.parse('{"__proto__":"x"}');
    const result = validateCatalogDraft("THEME", {
      kind: "THEME",
      name: "Warm stone",
      slug: "warm-stone",
      category: "core",
      industries: [],
      contractVersion: "2026-03",
      flagKey: null,
      targeting: { plans: [], industries: [], orgAllowlist: [], orgDenylist: [] },
      definition: { schemaVersion: "2026-03", tokens },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.message.includes("reserved"))).toBe(true);
    }
  });
});

describe("Catalog preview gate", () => {
  beforeEach(() => {
    authState.capabilities = [
      PLATFORM_CAPABILITIES.APPS_READ.code,
      PLATFORM_CAPABILITIES.APPS_AUTHOR.code,
      PLATFORM_CAPABILITIES.APPS_PUBLISH.code,
    ];
    navState.pathname = `/apps/${APP_ID}/preview/${SECTION_ITEM.id}`;
  });

  it("renders the production renderer at three widths", async () => {
    await renderPreview();
    const frame = previewFrame();
    expect(frame.style.width).toBe("1280px");
    expect(frame.textContent).toContain("Restaurant hero headline");
    clickButton("Tablet (768px)");
    expect(frame.style.width).toBe("768px");
    clickButton("Mobile (375px)");
    expect(frame.style.width).toBe("375px");
  });

  it("keeps publishing unavailable until the preview endpoint records it", async () => {
    previewResponse = reply(409, PREVIEW_PROBLEM);
    await renderPreview();
    expect(document.body.textContent).toContain(PREVIEW_PROBLEM.detail);
    expect(Array.from(document.querySelectorAll("button")).some((button) => button.textContent.includes("Publish version"))).toBe(false);
    expect(requests("POST")).toBe(1);
  });

  it("publishes the previewed version", async () => {
    await renderPreview();
    clickButton("Publish version v4");
    await settle();
    const publishBody = requestBodies("POST")[1];
    expect(publishBody).toBeDefined();
    const parsed = JSON.parse(publishBody ?? "{}") as { version?: number };
    expect(parsed.version).toBe(4);
    expect(document.body.textContent).toContain("Version v4 is live.");
  });

  it("surfaces a PREVIEW_REQUIRED refusal from the publish endpoint", async () => {
    publishResponse = reply(409, PREVIEW_PROBLEM);
    await renderPreview();
    clickButton("Publish version v4");
    await settle();
    expect(document.body.textContent).toContain("Preview required");
    expect(document.body.textContent).toContain(PREVIEW_PROBLEM.detail);
  });

  it("keeps a read-only preview non-publishable and does not record it", async () => {
    authState.capabilities = [PLATFORM_CAPABILITIES.APPS_READ.code];
    await renderPreview();
    expect(document.body.textContent).toContain("Read-only preview");
    expect(document.body.textContent).not.toContain("Publish version");
    expect(requests("POST")).toBe(0);
  });

  it("denies the preview route without the read capability", async () => {
    authState.capabilities = [];
    render(<CatalogPreviewPanel />);
    await settle();
    expect(document.body.textContent).toContain("Capability denied");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
