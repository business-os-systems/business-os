// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import axe from "axe-core";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import { PlatformShell } from "../src/components/layout/platform-shell";
import { PLATFORM_NAV_ITEMS } from "../src/components/layout/navigation.config";
import { TenantRecordProvider } from "../src/app/(platform)/tenants/[orgId]/tenant-record-context";
import { CatalogsProvider } from "../src/app/(platform)/catalogs/catalogs-context";
import type { TenantRecord } from "../src/lib/tenant-api";
import type { Catalog } from "../src/lib/catalogs-api";
import OverviewPage from "../src/app/(platform)/page";
import TenantsPage from "../src/app/(platform)/tenants/page";
import AppsPage from "../src/app/(platform)/apps/page";
import FlagsPage from "../src/app/(platform)/flags/page";
import AuditPage from "../src/app/(platform)/audit/page";
import OperatorsPage from "../src/app/(platform)/operators/page";
import OperatorDetailPage from "../src/app/(platform)/operators/[operatorId]/page";
import SignInPage from "../src/app/(auth)/sign-in/page";
import BreakGlassPage from "../src/app/(auth)/break-glass/page";
import SystemPage from "../src/app/(platform)/system/page";
import CatalogPanelPage from "../src/app/(platform)/catalogs/[category]/page";
import TenantOverviewPage from "../src/app/(platform)/tenants/[orgId]/overview/page";
import TenantAppsPage from "../src/app/(platform)/tenants/[orgId]/apps/page";
import TenantQuotasPage from "../src/app/(platform)/tenants/[orgId]/quotas/page";
import TenantActivityPage from "../src/app/(platform)/tenants/[orgId]/activity/page";
import TenantDangerPage from "../src/app/(platform)/tenants/[orgId]/danger/page";
import TenantSupportPage from "../src/app/(platform)/tenants/[orgId]/support/page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const authState = vi.hoisted(() => ({ capabilities: [] as string[] }));
const navState = vi.hoisted<{
  pathname: string;
  params: Record<string, string>;
}>(() => ({
  pathname: "/",
  params: { orgId: "org_1", category: "currency" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
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

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({ get: () => null }),
}));

const RECORD_TIMESTAMP = "2026-01-01T00:00:00.000Z";

const RECORD: TenantRecord = {
  profile: {
    id: "org_1",
    name: "River View",
    slug: "river-view",
    status: "ACTIVE",
    timezone: "Asia/Kolkata",
    createdAt: RECORD_TIMESTAMP,
  },
  counts: { asOf: RECORD_TIMESTAMP, branches: 1, members: 2 },
  apps: ["website-builder"],
  quotas: [],
  lifecycle: [],
  lifecycleHasMore: false,
  recentAudit: [],
};

const CATALOG: Catalog = {
  key: "currency",
  label: "Currencies",
  description: "ISO 4217 currency codes.",
  isSystem: true,
  values: [
    {
      catalogKey: "currency",
      code: "INR",
      label: "Indian Rupee",
      sortOrder: 10,
      isActive: true,
      metadata: {},
      version: 1,
      createdAt: RECORD_TIMESTAMP,
      updatedAt: RECORD_TIMESTAMP,
    },
  ],
};

function withTenant(element: ReactElement): ReactElement {
  return (
    <TenantRecordProvider value={{ record: RECORD, reload: () => undefined }}>
      {element}
    </TenantRecordProvider>
  );
}

function withCatalogs(element: ReactElement): ReactElement {
  return (
    <CatalogsProvider
      value={{
        catalogs: [CATALOG],
        applyValue: () => undefined,
        reload: () => undefined,
      }}
    >
      {element}
    </CatalogsProvider>
  );
}

interface Screen {
  readonly id: string;
  readonly pathname: string;
  readonly params?: Record<string, string>;
  readonly element: ReactElement;
}

const SCREENS: readonly Screen[] = [
  { id: "overview", pathname: "/", element: <OverviewPage /> },
  { id: "tenants", pathname: "/tenants", element: <TenantsPage /> },
  { id: "tenant-overview", pathname: "/tenants/org_1/overview", element: withTenant(<TenantOverviewPage />) },
  { id: "tenant-apps", pathname: "/tenants/org_1/apps", element: withTenant(<TenantAppsPage />) },
  { id: "tenant-quotas", pathname: "/tenants/org_1/quotas", element: withTenant(<TenantQuotasPage />) },
  { id: "tenant-activity", pathname: "/tenants/org_1/activity", element: withTenant(<TenantActivityPage />) },
  { id: "tenant-danger", pathname: "/tenants/org_1/danger", element: withTenant(<TenantDangerPage />) },
  { id: "tenant-support", pathname: "/tenants/org_1/support", element: withTenant(<TenantSupportPage />) },
  { id: "apps", pathname: "/apps", element: <AppsPage /> },
  { id: "catalog-panel", pathname: "/catalogs/currency", element: withCatalogs(<CatalogPanelPage />) },
  { id: "flags", pathname: "/flags", element: <FlagsPage /> },
  { id: "audit", pathname: "/audit", element: <AuditPage /> },
  { id: "operators", pathname: "/operators", element: <OperatorsPage /> },
  {
    id: "operator-detail",
    pathname: "/operators/op_1",
    params: { operatorId: "op_1" },
    element: <OperatorDetailPage />,
  },
  { id: "system", pathname: "/system", element: <SystemPage /> },
];

const AXE_OPTIONS = {
  runOnly: {
    type: "tag" as const,
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
  },
  rules: {
    // jsdom has no layout engine, so axe cannot compute contrast reliably.
    "color-contrast": { enabled: false },
  },
};

let container: HTMLDivElement;

beforeEach(() => {
  authState.capabilities = Object.values(PLATFORM_CAPABILITIES).map(
    (capability) => capability.code,
  );
  navState.pathname = "/";
  navState.params = { orgId: "org_1", category: "currency" };
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

function renderScreen(screen: Screen): void {
  navState.pathname = screen.pathname;
  navState.params = screen.params ?? { orgId: "org_1", category: "currency" };
  container.innerHTML = renderToString(
    <PlatformShell>{screen.element}</PlatformShell>,
  );
}

describe("Platform accessibility (T139, OP-4)", () => {
  for (const screen of SCREENS) {
    it(`has no WCAG A/AA axe violations on ${screen.id}`, async () => {
      renderScreen(screen);
      const results = await axe.run(container, AXE_OPTIONS);
      expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });

    it(`keeps ${screen.id} keyboard reachable`, () => {
      renderScreen(screen);
      const focusable = container.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex]',
      );
      expect(focusable.length).toBeGreaterThan(0);
      for (const element of focusable) {
        expect(element.getAttribute("tabindex")).not.toBe("-1");
      }
    });
  }

  it("keeps the mounted sign-in screen accessible and keyboard reachable", async () => {
    Object.defineProperty(window, "PublicKeyCredential", {
      value: class PublicKeyCredential {},
      configurable: true,
    });
    const mounted = document.createElement("div");
    document.body.appendChild(mounted);
    const root = createRoot(mounted);
    act(() => {
      root.render(
        <main>
          <SignInPage />
        </main>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const focusable = mounted.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]',
    );
    expect(focusable.length).toBeGreaterThan(0);
    const results = await axe.run(mounted, AXE_OPTIONS);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);

    act(() => root.unmount());
    mounted.remove();
  });

  it("has no WCAG A/AA axe violations on the break-glass denial", async () => {
    container.innerHTML = renderToString(await BreakGlassPage());
    const results = await axe.run(container, AXE_OPTIONS);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });

  it("keeps every Platform destination inside the operator plane", () => {
    for (const item of PLATFORM_NAV_ITEMS) {
      expect(item.href).not.toMatch(
        /^\/(dashboard|settings|onboarding|workspace|choose-tenant)(\/|$)/,
      );
    }
  });
});
