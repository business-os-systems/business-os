import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import type { TenantRecord } from "../src/lib/tenant-api";
import {
  TENANT_RECORD_NAV_GROUPS,
  isTenantRecordHubRoute,
  isTenantRecordHrefActive,
  tenantRecordHref,
  visibleTenantRecordGroups,
} from "../src/components/layout/tenant-record-nav.config";
import { TenantRecordNav } from "../src/components/layout/tenant-record-nav";
import { PlatformShell } from "../src/components/layout/platform-shell";
import { TenantRecordProvider } from "../src/app/(platform)/tenants/[orgId]/tenant-record-context";
import TenantOverviewPage from "../src/app/(platform)/tenants/[orgId]/overview/page";
import TenantAppsPage from "../src/app/(platform)/tenants/[orgId]/apps/page";
import TenantActivityPage from "../src/app/(platform)/tenants/[orgId]/activity/page";
import TenantDangerPage from "../src/app/(platform)/tenants/[orgId]/danger/page";
import TenantQuotasPage from "../src/app/(platform)/tenants/[orgId]/quotas/page";
import { InstalledAppsGrid } from "../src/app/(platform)/tenants/[orgId]/apps/installed-apps-grid";
import { AppSettingsSection } from "../src/app/(platform)/tenants/[orgId]/apps/app-settings-section";

const navState = vi.hoisted(() => ({
  pathname: "/tenants/org_1/overview",
}));
const authState = vi.hoisted(() => ({ capabilities: [] as string[] }));

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ orgId: "org_1" }),
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

const ORG_ID = "org_1";
const CAPABILITY_DENIED = "Capability denied";
const ALL_CAPABILITIES = [
  PLATFORM_CAPABILITIES.TENANTS_READ.code,
  PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
  PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code,
  PLATFORM_CAPABILITIES.AUDIT_READ.code,
  PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code,
];
const RECORD: TenantRecord = {
  profile: {
    id: ORG_ID,
    name: "River View",
    slug: "river-view",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  counts: { branches: 1, members: 2 },
  apps: ["website-builder"],
  quotas: [],
  lifecycle: [],
  lifecycleHasMore: false,
  recentAudit: [],
};

function withRecord(ui: ReactElement): ReactElement {
  return (
    <TenantRecordProvider value={{ record: RECORD, reload: () => undefined }}>
      {ui}
    </TenantRecordProvider>
  );
}

describe("Hub navigation config", () => {
  it("declares reading groups first and the risky group last", () => {
    expect(TENANT_RECORD_NAV_GROUPS.map((group) => group.id)).toEqual([
      "record",
      "risky",
    ]);
    const all = TENANT_RECORD_NAV_GROUPS.flatMap((group) => group.items);
    expect(all.map((item) => item.id)).toEqual([
      "overview",
      "apps",
      "quotas",
      "activity",
      "danger",
    ]);
  });

  it("makes every item a route below the tenant record", () => {
    for (const group of TENANT_RECORD_NAV_GROUPS) {
      for (const item of group.items) {
        expect(tenantRecordHref(ORG_ID, item.segment)).toBe(
          `/tenants/${ORG_ID}/${item.segment}`
        );
      }
    }
  });

  it("fails closed when the capability context is missing or empty", () => {
    expect(visibleTenantRecordGroups(undefined)).toEqual([]);
    expect(visibleTenantRecordGroups([])).toEqual([]);
  });

  it("filters items by capability without runtime partitioning", () => {
    const groups = visibleTenantRecordGroups([
      PLATFORM_CAPABILITIES.TENANTS_READ.code,
      PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code,
    ]);
    expect(groups.map((group) => group.id)).toEqual(["record", "risky"]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "overview",
      "apps",
      "activity",
    ]);
    expect(
      visibleTenantRecordGroups([PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code])[0]?.items.map(
        (item) => item.id
      )
    ).toEqual(["quotas"]);
  });

  it("recognizes hub routes and active destinations", () => {
    expect(isTenantRecordHubRoute("/tenants")).toBe(false);
    expect(isTenantRecordHubRoute(`/tenants/${ORG_ID}`)).toBe(true);
    expect(isTenantRecordHubRoute(`/tenants/${ORG_ID}/overview`)).toBe(true);
    expect(
      isTenantRecordHrefActive(`/tenants/${ORG_ID}/overview`, `/tenants/${ORG_ID}/overview`)
    ).toBe(true);
    expect(
      isTenantRecordHrefActive(`/tenants/${ORG_ID}/overview`, `/tenants/${ORG_ID}/apps`)
    ).toBe(false);
  });
});

describe("Hub navigation rendering", () => {
  it("renders only permitted items and marks the active route", () => {
    navState.pathname = `/tenants/${ORG_ID}/overview`;
    const html = renderToString(
      <TenantRecordNav
        orgId={ORG_ID}
        capabilities={[PLATFORM_CAPABILITIES.TENANTS_READ.code]}
      />
    );
    expect(html).toContain("Overview");
    expect(html).toContain("Apps &amp; entitlements");
    expect(html).toContain("Activity");
    expect(html).not.toContain("Danger zone");
    expect(html).toContain(`aria-current="page"`);
    expect(html).toContain("focus-visible:ring-focus-ring");
    expect(html).toContain(`href="/tenants/${ORG_ID}/overview"`);
    expect(html).toContain(`href="/tenants"`);
    expect(html).toContain("All tenants");
  });

  it("renders grouped overlines and the compact mobile switcher", () => {
    navState.pathname = `/tenants/${ORG_ID}/danger`;
    const html = renderToString(
      <TenantRecordNav orgId={ORG_ID} capabilities={ALL_CAPABILITIES} />
    );
    expect(html).toContain("Record");
    expect(html).toContain("Risky");
    expect(html).toContain("Danger zone");
    expect(html).toContain(`aria-label="Tenant record section"`);
  });

  it("collapses the primary rail inside the hub and expands on the collection", () => {
    authState.capabilities = [PLATFORM_CAPABILITIES.TENANTS_READ.code];
    navState.pathname = `/tenants/${ORG_ID}/overview`;
    expect(
      renderToString(
        <PlatformShell>
          <p>Hub content</p>
        </PlatformShell>
      )
    ).toContain("w-16");
    navState.pathname = "/tenants";
    expect(
      renderToString(
        <PlatformShell>
          <p>Fleet</p>
        </PlatformShell>
      )
    ).toContain("w-52");
  });

  it("renders no destination without capabilities", () => {
    const html = renderToString(
      <TenantRecordNav orgId={ORG_ID} capabilities={[]} />
    );
    expect(html).not.toContain(">Overview<");
    expect(html).not.toContain("Danger zone");
    expect(html).toContain("All tenants");
  });
});

describe("Tenant record panel denial per route", () => {
  it("denies every panel without its capability", () => {
    authState.capabilities = [];
    expect(renderToString(withRecord(<TenantOverviewPage />))).toContain(
      CAPABILITY_DENIED
    );
    expect(renderToString(withRecord(<TenantAppsPage />))).toContain(
      CAPABILITY_DENIED
    );
    expect(renderToString(withRecord(<TenantActivityPage />))).toContain(
      CAPABILITY_DENIED
    );
    expect(renderToString(withRecord(<TenantDangerPage />))).toContain(
      CAPABILITY_DENIED
    );
    expect(renderToString(<TenantQuotasPage />)).toContain(CAPABILITY_DENIED);
  });
});

describe("Apps panel", () => {
  it("shows read-only installed app tiles and the console link", () => {
    const html = renderToString(
      <InstalledAppsGrid apps={["website-builder"]} canManageEntitlements />
    );
    expect(html).toContain("Website Builder");
    expect(html).toContain("read-only here");
    expect(html).toContain(`href="/apps"`);
    expect(html).not.toContain('type="checkbox"');
  });

  it("hides the console link from a read-only operator", () => {
    const html = renderToString(
      <InstalledAppsGrid
        apps={["website-builder"]}
        canManageEntitlements={false}
      />
    );
    expect(html).not.toContain(`href="/apps"`);
  });

  it("renders a genuine empty state when nothing is installed", () => {
    const html = renderToString(
      <InstalledAppsGrid apps={[]} canManageEntitlements />
    );
    expect(html).toContain("No installed apps");
  });

  it("states when no installed app declares a settings schema", () => {
    const html = renderToString(
      <AppSettingsSection orgId={ORG_ID} apps={[]} />
    );
    expect(html).toContain("No configurable application");
  });
});

describe("Hub data contract", () => {
  it("fetches the tenant record only in the hub layout", () => {
    const routeRoot = fileURLToPath(
      new URL(
        "../src/app/(platform)/tenants/[orgId]",
        import.meta.url
      )
    );
    const files = readdirSync(routeRoot, { recursive: true }).filter(
      (entry): entry is string => typeof entry === "string" && entry.endsWith(".tsx")
    );
    const panelFiles = files.filter(
      (entry) => !entry.endsWith("layout.tsx") && !entry.endsWith("tenant-record-context.tsx")
    );
    for (const entry of panelFiles) {
      const source = readFileSync(`${routeRoot}/${entry}`, "utf8");
      expect(source, entry).not.toContain("fetchTenantRecord");
    }
  });
});
