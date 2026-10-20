import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import OverviewPage from "../src/app/(dashboard)/dashboard/page";
import { defaultDashboardOverviewConfig } from "../src/app/(dashboard)/dashboard/dashboard.config";
import { SidebarNav } from "../src/components/layout/sidebar-nav";
import { PERMISSIONS } from "@suite/core";
import { GlobeIcon, ShoppingCartIcon, BuildingIcon } from "@suite/ui/icons";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

describe("Overview Dashboard & Main Sidebar Parity (Issue #157)", () => {
  describe("Executive App Launcher Config & Sleek Layout", () => {
    it("renders default title and subtitle from declarative dashboard config", () => {
      const html = renderToString(<OverviewPage />);
      expect(html).toContain(defaultDashboardOverviewConfig.title);
      expect(html).toContain("Welcome to your Business OS workspace");
    });

    it("renders custom declarative config override when provided", () => {
      const html = renderToString(
        <OverviewPage
          config={{
            title: "Custom Executive Suite",
            subtitle: "Streamlined operational controls for headquarters.",
            apps: [],
          }}
        />
      );
      expect(html).toContain("Custom Executive Suite");
      expect(html).toContain("Streamlined operational controls for headquarters.");
    });

    it("renders sleek 3-column responsive grid and compact action cards", () => {
      const html = renderToString(
        <OverviewPage
          initialApps={[
            {
              title: "Website Builder",
              code: "website-builder",
              desc: "Visual canvas studio and storefront delivery.",
              href: "/sites",
              icon: GlobeIcon,
              status: "Available",
              isAvailable: true,
            },
          ]}
        />
      );

      // Verifies 3-column responsive grid layout
      expect(html).toContain("grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4");

      // Verifies compact card footprint (p-4 padding, min-h-[148px])
      expect(html).toContain("p-4");
      expect(html).toContain("min-h-[148px]");

      // Verifies compact icon emblem (h-8 w-8 with h-4 w-4 icon)
      expect(html).toContain("h-8 w-8");
      expect(html).toContain("h-4 w-4");

      // Verifies full card clickability and action trigger
      expect(html).toContain("href=\"/sites\"");
      expect(html).toContain("Open Application");
    });

    it("displays human-readable titles instead of hyphenated IDs", () => {
      const html = renderToString(
        <OverviewPage
          initialApps={[
            {
              title: "Website Builder",
              code: "website-builder",
              desc: "Studio editor.",
              href: "/sites",
              icon: GlobeIcon,
              status: "Available",
              isAvailable: true,
            },
            {
              title: "Restaurant POS",
              code: "restaurant-pos",
              desc: "Touch ordering.",
              href: "/pos",
              icon: ShoppingCartIcon,
              status: "Coming Soon",
              isAvailable: false,
            },
          ]}
        />
      );

      expect(html).toContain("Website Builder");
      expect(html).toContain("Restaurant POS");
      expect(html).not.toContain(">website-builder<");
      expect(html).not.toContain(">restaurant-pos<");
    });
  });

  describe("Pure Capability-Based App Visibility (Principle VIII)", () => {
    const testApps = [
      {
        title: "Website Builder",
        code: "website-builder",
        desc: "Visual CMS studio.",
        href: "/sites",
        icon: GlobeIcon,
        status: "Available" as const,
        isAvailable: true,
        permission: PERMISSIONS.WEBSITE_BUILDER.SITES_READ, // cms:sites:read
      },
      {
        title: "Restaurant POS",
        code: "restaurant-pos",
        desc: "Point of sale register.",
        href: "/pos",
        icon: ShoppingCartIcon,
        status: "Available" as const,
        isAvailable: true,
        permission: "pos:orders:read",
      },
      {
        title: "Lodging PMS",
        code: "lodging-pms",
        desc: "Reservation calendar.",
        href: "/pms",
        icon: BuildingIcon,
        status: "Available" as const,
        isAvailable: true,
        permission: "pms:properties:read",
      },
    ];

    it("displays all installed apps to Organization Owner with wildcard permission (*)", () => {
      const html = renderToString(
        <OverviewPage
          initialApps={testApps}
          userPermissions={[PERMISSIONS.WILDCARD]}
        />
      );

      expect(html).toContain("Website Builder");
      expect(html).toContain("Restaurant POS");
      expect(html).toContain("Lodging PMS");
    });

    it("displays only authorized apps to scoped specialist user", () => {
      // User has only cms:sites:read capability
      const html = renderToString(
        <OverviewPage
          initialApps={testApps}
          userPermissions={[PERMISSIONS.WEBSITE_BUILDER.SITES_READ]}
        />
      );

      expect(html).toContain("Website Builder");
      expect(html).not.toContain("Restaurant POS");
      expect(html).not.toContain("Lodging PMS");
    });

    it("hides all capability-gated apps from unauthorized staff", () => {
      // User has only core:organization:read, lacking specific app capabilities
      const html = renderToString(
        <OverviewPage
          initialApps={testApps}
          userPermissions={[PERMISSIONS.CORE.ORGANIZATION_READ]}
        />
      );

      expect(html).not.toContain("Website Builder");
      expect(html).not.toContain("Restaurant POS");
      expect(html).not.toContain("Lodging PMS");
      expect(html).toContain("No applications installed for this workspace.");
    });
  });

  describe("Main Sidebar Visual Parity with Settings Sub-Navigation", () => {
    it("renders navigation items with refined typography (text-[13px]) and compact icons (h-4 w-4)", () => {
      const html = renderToString(
        <SidebarNav
          items={[
            { id: "home", name: "Overview", href: "/dashboard", icon: "home" },
            { id: "sites", name: "Website Builder", href: "/sites", icon: "sites" },
          ]}
        />
      );

      // Verifies typography parity: text-xs sm:text-[13px] and min-h-[38px]
      expect(html).toContain("text-xs sm:text-[13px]");
      expect(html).toContain("min-h-[38px]");

      // Verifies icon size parity: h-4 w-4
      expect(html).toContain("h-4 w-4");
    });

    it("renders active navigation item with left accent bar matching settings-nav", () => {
      const html = renderToString(
        <SidebarNav
          items={[
            { id: "home", name: "Overview", href: "/dashboard", icon: "home" },
          ]}
        />
      );

      // Current pathname is /dashboard, so Overview is active
      expect(html).toContain("bg-brand-tint/70");
      expect(html).toContain("before:w-1");
      expect(html).toContain("before:bg-brand");
      expect(html).toContain("before:rounded-r-sm");
    });

    it("maintains centered icon alignment and active highlight on collapse", () => {
      const html = renderToString(
        <SidebarNav
          collapsed={true}
          items={[
            { id: "home", name: "Overview", href: "/dashboard", icon: "home" },
          ]}
        />
      );

      expect(html).toContain("w-16");
      expect(html).toContain("justify-center");
      expect(html).toContain("h-4 w-4");
      expect(html).toContain("bg-brand-tint/70");
      expect(html).toContain("before:w-1");
    });

    it("strictly enforces pure capability gating in SidebarNav", () => {
      const testConfig = {
        topItems: [
          {
            id: "home",
            name: "Overview",
            href: "/dashboard",
            icon: "home",
            // un-gated
          },
          {
            id: "sites",
            name: "Website Builder",
            href: "/sites",
            icon: "sites",
            permission: PERMISSIONS.WEBSITE_BUILDER.SITES_READ,
          },
          {
            id: "pos",
            name: "Restaurant POS",
            href: "/pos",
            icon: "pos",
            permission: "pos:orders:read",
          },
        ],
        bottomItems: [],
      };

      // Owner sees all
      const ownerHtml = renderToString(
        <SidebarNav
          config={testConfig}
          userPermissions={[PERMISSIONS.WILDCARD]}
        />
      );
      expect(ownerHtml).toContain("Overview");
      expect(ownerHtml).toContain("Website Builder");
      expect(ownerHtml).toContain("Restaurant POS");

      // Scoped user sees only permitted
      const scopedHtml = renderToString(
        <SidebarNav
          config={testConfig}
          userPermissions={[PERMISSIONS.WEBSITE_BUILDER.SITES_READ]}
        />
      );
      expect(scopedHtml).toContain("Overview");
      expect(scopedHtml).toContain("Website Builder");
      expect(scopedHtml).not.toContain("Restaurant POS");
    });

    it("renders slim sidebar width (w-52 sm:w-56) and omits System Online & version badges", () => {
      const html = renderToString(
        <SidebarNav
          items={[
            { id: "home", name: "Overview", href: "/dashboard", icon: "home" },
          ]}
        />
      );

      // Verifies reduced width
      expect(html).toContain("w-52 sm:w-56");
      expect(html).not.toContain("w-64");

      // Verifies removal of system online & version badges per user directive
      expect(html).not.toContain("System Online");
      expect(html).not.toContain("v2.0");
    });

    it("renders Settings item directly beneath installed apps in the main nav", () => {
      const testConfig = {
        topItems: [
          { id: "sites", name: "Website Builder", href: "/sites", icon: "sites" },
        ],
        bottomItems: [
          { id: "settings", name: "Settings", href: "/settings/general", icon: "settings" },
        ],
      };

      const html = renderToString(
        <SidebarNav config={testConfig} />
      );

      // Settings must be rendered inside the same navigation container with System section
      expect(html).toContain("Website Builder");
      expect(html).toContain("System");
      expect(html).toContain("Settings");
      // Must not render a separate fixed bottom div
      expect(html).not.toContain("flex-shrink-0 bg-surface space-y-2");
    });

    it("aligns header topbar and sidebar brand header height to h-12 with border-border", () => {
      const sidebarHtml = renderToString(
        <SidebarNav
          items={[
            { id: "home", name: "Overview", href: "/dashboard", icon: "home" },
          ]}
        />
      );

      // Verifies sidebar logo container is h-12 and border-border (not h-16)
      expect(sidebarHtml).toContain("h-12");
      expect(sidebarHtml).not.toContain("h-16");
      expect(sidebarHtml).toContain("border-border");
    });
  });
});

