import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { PERMISSIONS } from "@suite/core";
import { SidebarNav, isRouteActive } from "../src/components/layout/sidebar-nav";
import { SettingsNav } from "../src/components/layout/settings-nav";
import { DashboardShell } from "../src/components/layout/dashboard-shell";
import SettingsLayout from "../src/app/(dashboard)/settings/layout";
import SettingsRootPage from "../src/app/(dashboard)/settings/page";
import { baseNavigationConfig, buildNavigationConfig } from "../src/components/layout/navigation.config";
import { settingsCategoriesConfig } from "../src/components/layout/settings.config";
import { getNavIcon, getSettingsIcon } from "../src/components/layout/icon-registry";

// Mock next/navigation
const mockPathname = vi.fn().mockReturnValue("/dashboard");
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
    back: vi.fn(),
  }),
}));

describe("Settings Hub Navigation Shell & Auto-Collapse Primitives (User Story 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue("/dashboard");
  });

  describe("SidebarNav Auto-Collapse & Capability Permissions", () => {
    it("renders default base navigation with bottom-pinned settings anchor", () => {
      const html = renderToString(
        <SidebarNav
          config={baseNavigationConfig}
          userPermissions={[PERMISSIONS.SETTINGS.READ]}
        />
      );
      expect(html).toContain("Overview");
      expect(html).toContain("Settings");
      expect(html).toContain("Business OS");
      expect(html).toContain("w-64");
    });

    it("collapses to w-16 icon strip when collapsed=true and hides text labels", () => {
      const html = renderToString(
        <SidebarNav
          collapsed={true}
          config={baseNavigationConfig}
          userPermissions={[PERMISSIONS.SETTINGS.READ]}
        />
      );
      expect(html).toContain("w-16");
      expect(html).not.toContain("Business OS");
      // Title attribute is preserved for accessibility / hover tooltip
      expect(html).toContain('title="Settings"');
      expect(html).toContain('title="Overview"');
    });

    it("hides Settings navigation item when user lacks capability permission", () => {
      const html = renderToString(
        <SidebarNav
          config={baseNavigationConfig}
          userPermissions={["inventory:read"]} // Lacks settings:* or settings:read
        />
      );
      expect(html).toContain("Overview");
      expect(html).not.toContain("Settings");
    });

    it("shows Settings navigation item when user has wildcard permission", () => {
      const html = renderToString(
        <SidebarNav
          config={baseNavigationConfig}
          userPermissions={["*"]}
        />
      );
      expect(html).toContain("Settings");
    });

    it("supports backward compatibility with items array prop", () => {
      const testItems = [
        { id: "home", name: "Overview", href: "/", icon: "home" },
        { id: "settings", name: "Settings", href: "/settings/general", icon: "settings" },
      ];
      const html = renderToString(<SidebarNav items={testItems} />);
      expect(html).toContain("Overview");
      expect(html).toContain("Settings");
    });

    it("dynamically merges installed apps with base navigation using buildNavigationConfig", () => {
      const dynamicConfig = buildNavigationConfig([
        { id: "sites", name: "Website Builder", href: "/sites", icon: "sites", badge: "App 01" },
      ]);
      const html = renderToString(
        <SidebarNav
          config={dynamicConfig}
          userPermissions={[PERMISSIONS.SETTINGS.READ]}
        />
      );
      expect(html).toContain("Overview");
      expect(html).toContain("Website Builder");
      expect(html).toContain("App 01");
      expect(html).toContain("Settings");
    });
  });

  describe("SettingsNav Secondary Sub-Navigation", () => {
    it("renders all 4 primary vertical categories from settingsCategoriesConfig", () => {
      mockPathname.mockReturnValue("/settings/general");
      const html = renderToString(
        <SettingsNav
          categories={settingsCategoriesConfig}
          userPermissions={["*"]}
        />
      );
      expect(html).toContain("General");
      expect(html).toContain("Branches");
      expect(html).toContain("Members");
      expect(html).toContain("Roles &amp; Permissions");
      expect(html).toContain("/settings/general");
      expect(html).toContain("/settings/branches");
      expect(html).toContain("/settings/members");
      expect(html).toContain("/settings/roles");
    });

    it("filters categories based on discrete capability permissions", () => {
      mockPathname.mockReturnValue("/settings/general");
      const html = renderToString(
        <SettingsNav
          categories={settingsCategoriesConfig}
          userPermissions={[PERMISSIONS.SETTINGS.ORGANIZATION_VIEW]}
        />
      );
      expect(html).toContain("General");
      expect(html).not.toContain("Branches");
      expect(html).not.toContain("Members");
      expect(html).not.toContain("Roles &amp; Permissions");
    });

    it("highlights active tab matching current pathname", () => {
      mockPathname.mockReturnValue("/settings/branches");
      const html = renderToString(
        <SettingsNav
          categories={settingsCategoriesConfig}
          userPermissions={["*"]}
        />
      );
      expect(html).toContain("before:bg-brand");
      expect(html).toContain("/settings/branches");
    });
  });

  describe("DashboardShell Auto-Collapse & Sub-Nav Docking", () => {
    it("renders expanded sidebar (w-64) and no SettingsNav on non-settings routes", () => {
      mockPathname.mockReturnValue("/dashboard");
      const html = renderToString(
        <DashboardShell
          tenant={{
            organizationId: "org-1",
            organizationName: "Test Org",
            userName: "Test Operator",
            userEmail: "operator@example.com",
            userEmailVerified: true,
            userPermissions: ["*"],
          }}
        >
          <div>Dashboard Content</div>
        </DashboardShell>
      );
      expect(html).toContain("w-64");
      expect(html).toContain("Dashboard Content");
      // Secondary SettingsNav header should not be present
      expect(html).not.toContain("Workspace Settings");
    });

    it("auto-collapses sidebar to w-16 and docks SettingsNav when on /settings/*", () => {
      mockPathname.mockReturnValue("/settings/general");
      const html = renderToString(
        <DashboardShell
          tenant={{
            organizationId: "org-1",
            organizationName: "Test Org",
            userName: "Test Operator",
            userEmail: "operator@example.com",
            userEmailVerified: true,
            userPermissions: ["*"],
          }}
        >
          <div>Settings Content</div>
        </DashboardShell>
      );
      expect(html).toContain("w-16");
      expect(html).toContain("Settings");
      expect(html).toContain("General");
      expect(html).toContain("Settings Content");
    });
  });

  describe("SettingsLayout Mobile Drill-Down & Master-Detail Navigation", () => {
    it("renders Back to Settings mobile header on sub-routes", () => {
      mockPathname.mockReturnValue("/settings/general");
      const html = renderToString(
        <SettingsLayout>
          <div>General Settings Content</div>
        </SettingsLayout>
      );
      expect(html).toContain("Back to Settings");
      expect(html).toContain("General");
      expect(html).toContain("General Settings Content");
    });

    it("suppresses Back to Settings mobile header on root /settings page", () => {
      mockPathname.mockReturnValue("/settings");
      const html = renderToString(
        <SettingsLayout>
          <div>Root Settings Index</div>
        </SettingsLayout>
      );
      expect(html).not.toContain("Back to Settings");
      expect(html).toContain("Root Settings Index");
    });
  });

  describe("SettingsRootPage Drill-Down Index", () => {
    it("renders mobile category drill-down index", () => {
      mockPathname.mockReturnValue("/settings");
      const html = renderToString(<SettingsRootPage userPermissions={["*"]} />);
      expect(html).toContain("General");
      expect(html).toContain("Branches");
      expect(html).toContain("Members");
      expect(html).toContain("Roles &amp; Permissions");
    });
  });

  describe("Convergence Directives Verification (Clean Code & Security)", () => {
    it("strictly enforces fail-closed behavior when permissions context is missing or empty", () => {
      // Missing userPermissions entirely
      const htmlMissing = renderToString(
        <SidebarNav config={baseNavigationConfig} />
      );
      expect(htmlMissing).toContain("Overview");
      expect(htmlMissing).not.toContain("Settings");

      // Empty userPermissions array
      const htmlEmpty = renderToString(
        <SidebarNav config={baseNavigationConfig} userPermissions={[]} />
      );
      expect(htmlEmpty).toContain("Overview");
      expect(htmlEmpty).not.toContain("Settings");

      // SettingsNav fail-closed
      const htmlSettingsMissing = renderToString(
        <SettingsNav categories={settingsCategoriesConfig} />
      );
      expect(htmlSettingsMissing).not.toContain("General");
      expect(htmlSettingsMissing).not.toContain("Branches");
      expect(htmlSettingsMissing).not.toContain("Members");
      expect(htmlSettingsMissing).not.toContain("Roles &amp; Permissions");
    });

    it("evaluates route activation correctly via isRouteActive", () => {
      expect(isRouteActive("/dashboard", "/dashboard")).toBe(true);
      expect(isRouteActive("/dashboard", "/")).toBe(true);
      expect(isRouteActive("/settings/general", "/settings/general")).toBe(true);
      expect(isRouteActive("/settings/branches", "/settings/general")).toBe(true);
      expect(isRouteActive("/sites", "/dashboard")).toBe(false);
      expect(isRouteActive("/sites/new", "/sites")).toBe(true);
      expect(isRouteActive("/sites-other", "/sites")).toBe(false);
    });

    it("resolves registered navigation and settings icons deterministically", () => {
      expect(getNavIcon("home")).toBeDefined();
      expect(getNavIcon("settings")).toBeDefined();
      expect(getSettingsIcon("building")).toBeDefined();
      expect(getSettingsIcon("map-pin")).toBeDefined();
      expect(getSettingsIcon("users")).toBeDefined();
      expect(getSettingsIcon("shield")).toBeDefined();

      expect(() => getNavIcon("unregistered_icon")).toThrow(
        /Unregistered navigation icon key/
      );
      expect(() => getSettingsIcon("unregistered_icon")).toThrow(
        /Unregistered settings category icon key/
      );
    });
  });
});
