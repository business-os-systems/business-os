// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import { ValidationError } from "@suite/core/errors";
import { renderToString } from "react-dom/server";
import { SettingsAlerts } from "../src/components/settings/settings-alerts";
import { AppRecordProvider } from "../src/app/(platform)/apps/[appId]/app-record-context";
import AppRecordSettingsPage from "../src/app/(platform)/apps/[appId]/settings/page";
import type { CatalogApp } from "../src/lib/apps-api";
import type { AppSettingsDefaultsView } from "../src/lib/app-settings-defaults-api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const fetchAppSettingsDefaults = vi.hoisted(() => vi.fn());
const updateAppSettingsDefaults = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ capabilities: [] as string[] }));
const APP_ID = "website-builder";

vi.mock("@/lib/app-settings-defaults-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/app-settings-defaults-api")>();
  return { ...actual, fetchAppSettingsDefaults, updateAppSettingsDefaults };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/apps/website-builder/settings",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ appId: APP_ID }),
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
  appId: APP_ID,
  name: "Website Builder",
  title: "Website Builder & Headless CMS",
  description: "Visual canvas studio.",
  category: "content",
  availability: "AVAILABLE",
  sortOrder: 0,
  installedCount: 2,
  version: null,
  updatedAt: null,
};

const FIELDS = [
  {
    key: "customDomainEnabled",
    label: "Custom domains",
    description: "Allow custom domains.",
    required: false,
    scope: "tenant" as const,
    defaultValue: false,
    kind: "boolean" as const,
  },
  {
    key: "defaultLocale",
    label: "Default locale",
    description: "Locale for new sites.",
    required: false,
    scope: "tenant" as const,
    defaultValue: "en",
    kind: "text" as const,
    minLength: 2,
    maxLength: 35,
    format: "bcp47" as const,
  },
];

const DEFAULTS: AppSettingsDefaultsView = {
  appId: APP_ID,
  schema: { fields: FIELDS },
  values: {},
  effectiveValues: { customDomainEnabled: false, defaultLocale: "en" },
  sources: { customDomainEnabled: "schema", defaultLocale: "schema" },
  staleFields: [],
  version: "0",
};

let container: HTMLDivElement;
let root: Root;

function renderPage(): void {
  root.render(
    <AppRecordProvider value={{ app: APP, reload: () => undefined }}>
      <AppRecordSettingsPage />
    </AppRecordProvider>,
  );
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  authState.capabilities = [PLATFORM_CAPABILITIES.APPS_READ.code];
  fetchAppSettingsDefaults.mockReset();
  updateAppSettingsDefaults.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Application settings defaults", () => {
  it("renders the loading state before defaults arrive", async () => {
    fetchAppSettingsDefaults.mockReturnValue(new Promise(() => undefined));
    await act(async () => {
      renderPage();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Loading application defaults");
  });

  it("shows effective values and a read-only notice without the author capability", async () => {
    fetchAppSettingsDefaults.mockResolvedValue(DEFAULTS);
    await act(async () => {
      renderPage();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Effective settings");
    expect(container.textContent).toContain("Schema default");
    expect(container.textContent).toContain("Read-only settings");
    expect(container.textContent).not.toContain("Save defaults");
  });

  it("shows the form for an author", async () => {
    authState.capabilities = [
      PLATFORM_CAPABILITIES.APPS_READ.code,
      PLATFORM_CAPABILITIES.APPS_AUTHOR.code,
    ];
    fetchAppSettingsDefaults.mockResolvedValue(DEFAULTS);
    await act(async () => {
      renderPage();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Save defaults");
    expect(container.querySelector("form")).not.toBeNull();
  });
});

describe("Application settings defaults access", () => {
  it("denies the page without the read capability", async () => {
    authState.capabilities = [];
    await act(async () => {
      renderPage();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Capability denied");
  });

  it("renders the RFC 7807 error state", async () => {
    fetchAppSettingsDefaults.mockRejectedValueOnce(
      Object.assign(new Error("Read failed"), { name: "Error" }),
    );
    await act(async () => {
      renderPage();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Request failed");
  });
});

describe("Application settings defaults alerts", () => {
  it("shows stored-key, removed-key, mutation and unmapped warnings", () => {
    const html = renderToString(
      <SettingsAlerts
        settings={DEFAULTS}
        removedFields={["legacyFlag"]}
        mutationError="Mutation failed"
        conflict
        unmappedIssues={[{ name: "legacyFlag", reason: "Unknown setting." }]}
        onReload={() => undefined}
      />,
    );
    expect(html).toContain("Configuration keys removed");
    expect(html).toContain("Mutation failed");
    expect(html).toContain("Stored keys rejected");
    expect(html).toContain("Reload settings");
  });
});

describe("Application settings defaults save", () => {
  it("maps server validation details onto the form", async () => {
    authState.capabilities = [
      PLATFORM_CAPABILITIES.APPS_READ.code,
      PLATFORM_CAPABILITIES.APPS_AUTHOR.code,
    ];
    fetchAppSettingsDefaults.mockResolvedValue(DEFAULTS);
    updateAppSettingsDefaults.mockRejectedValue(
      new ValidationError("Invalid defaults.", [
        { name: "defaultLocale", reason: "Invalid locale." },
      ]),
    );
    await act(async () => {
      renderPage();
      await Promise.resolve();
    });
    const form = container.querySelector("form");
    if (form === null) throw new Error("Settings form missing");
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });
    await settle();
    expect(container.textContent).toContain("Invalid locale.");
  });

  it("saves defaults with the observed version", async () => {
    authState.capabilities = [
      PLATFORM_CAPABILITIES.APPS_READ.code,
      PLATFORM_CAPABILITIES.APPS_AUTHOR.code,
    ];
    fetchAppSettingsDefaults.mockResolvedValue(DEFAULTS);
    updateAppSettingsDefaults.mockResolvedValue({
      ...DEFAULTS,
      values: { customDomainEnabled: true },
      effectiveValues: { customDomainEnabled: true, defaultLocale: "en" },
      sources: { customDomainEnabled: "app", defaultLocale: "schema" },
      version: "1",
      removedFields: [],
    });
    await act(async () => {
      renderPage();
      await Promise.resolve();
    });
    const form = container.querySelector("form");
    if (form === null) throw new Error("Settings form missing");
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });
    await settle();
    expect(updateAppSettingsDefaults).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: APP_ID,
        expectedVersion: "0",
      }),
    );
    expect(container.textContent).toContain("Application default");
  });
});
