import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { SidebarNav, NAVIGATION_APPS } from "../src/components/layout/sidebar-nav";
import { HeaderTopbar } from "../src/components/layout/header-topbar";
import OverviewPage from "../src/app/(dashboard)/page";

describe("Tenant Navigation Shell & App Launcher Primitives", () => {
  it("defines navigation apps including Website Builder, POS, PMS, and Inventory", () => {
    expect(NAVIGATION_APPS.length).toBeGreaterThanOrEqual(5);
    const siteItem = NAVIGATION_APPS.find((i) => i.id === "sites");
    expect(siteItem).toBeDefined();
    expect(siteItem?.name).toBe("Website Builder");
    expect(siteItem?.href).toBe("/sites");
  });

  it("renders SidebarNav with brand identity and installed app items", () => {
    const html = renderToString(<SidebarNav />);
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
    const html = renderToString(<OverviewPage />);
    expect(html).toContain("Executive App Launcher");
    expect(html).toContain("Website Builder &amp; Headless CMS");
    expect(html).toContain("Open Application");
  });
});
