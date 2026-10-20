import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { SidebarNav } from "../src/components/layout/sidebar-nav";
import { HeaderTopbar } from "../src/components/layout/header-topbar";
import OverviewPage from "../src/app/(dashboard)/dashboard/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

describe("Tenant Navigation Shell & App Launcher Primitives", () => {
  it("renders dynamic navigation items in SidebarNav", () => {
    const items = [
      { id: "home", name: "Overview", href: "/", icon: "home" },
      { id: "settings", name: "Settings", href: "/settings", icon: "settings" },
    ];
    const html = renderToString(<SidebarNav items={items} />);
    expect(html).toContain("Overview");
    expect(html).toContain("Settings");
  });

  it("renders SidebarNav with brand identity and dynamic installed app items", () => {
    const testItems = [
      { id: "home", name: "Overview", href: "/", icon: "home" },
      { id: "sites", name: "Website Builder", href: "/sites", icon: "sites", badge: "App 01" },
      { id: "pos", name: "Restaurant POS", href: "/pos", icon: "pos", badge: "App 04" },
      { id: "inventory", name: "Central Stock", href: "/inventory", icon: "inventory", badge: "App 05" },
    ];
    const html = renderToString(<SidebarNav items={testItems} />);
    expect(html).toContain("Business OS");
    expect(html).toContain("Website Builder");
    expect(html).toContain("Restaurant POS");
    expect(html).toContain("Central Stock");
    expect(html).toContain("App 01");
  });

  it("renders HeaderTopbar with active tenant and branch context", () => {
    const html = renderToString(
      <HeaderTopbar
        tenant={{
          organizationId: "org-test",
          organizationName: "Riverview Hospitality Group",
          activeBranchName: "Flagship Riverside Cafe (Branch #1)",
          userName: "Rohit Bahuguna",
          userRole: "Platform Admin",
        }}
      />
    );
    expect(html).toContain("Riverview Hospitality Group");
    expect(html).toContain("Flagship Riverside Cafe");
    expect(html).toContain("Rohit Bahuguna");
  });

  it("renders OverviewPage launcher cards with action buttons", () => {
    const html = renderToString(
      <OverviewPage
        initialApps={[
          {
            title: "Website Builder & Headless CMS",
            code: "App 01",
            desc: "Visual canvas studio and storefront delivery.",
            href: "/sites",
            icon: () => null,
            status: "Available",
            isAvailable: true,
          },
        ]}
      />
    );
    expect(html).toContain("Executive App Launcher");
    expect(html).toContain("Website Builder &amp; Headless CMS");
    expect(html).toContain("Open Application");
  });
});
