// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { PERMISSIONS } from "@suite/core";

const navigation = vi.hoisted(() => ({ pathname: "/websites" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { WebsiteBuilderNav } from "@/components/layout/website-builder-nav";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  WEBSITE_BUILDER_BACK_LINK,
  WEBSITE_BUILDER_NAV_GROUPS,
  isWebsiteBuilderAppRoute,
  visibleWebsiteBuilderNavGroups,
} from "@/components/layout/website-builder-nav.config";

const ALL_CAPABILITIES = [
  PERMISSIONS.WEBSITE_BUILDER.SITES_READ,
  PERMISSIONS.WEBSITE_BUILDER.LEADS_READ,
  PERMISSIONS.WEBSITE_BUILDER.SITES_WRITE,
];

describe("Website Builder navigation configuration", () => {
  it("declares Overview, Inquiries and Settings in reading order", () => {
    const items = WEBSITE_BUILDER_NAV_GROUPS.flatMap((group) => group.items);

    expect(items.map((item) => item.label)).toEqual([
      "Overview",
      "Inquiries",
      "Settings",
    ]);
    expect(items.map((item) => item.href)).toEqual([
      "/websites",
      "/websites/inquiries",
      "/websites/settings",
    ]);
    expect(items.map((item) => item.capabilities)).toEqual([
      [PERMISSIONS.WEBSITE_BUILDER.SITES_READ],
      [PERMISSIONS.WEBSITE_BUILDER.LEADS_READ],
      [PERMISSIONS.WEBSITE_BUILDER.SITES_WRITE],
    ]);
  });

  it("recognizes the hub and the legacy sites surfaces", () => {
    expect(isWebsiteBuilderAppRoute("/websites")).toBe(true);
    expect(isWebsiteBuilderAppRoute("/websites/settings")).toBe(true);
    expect(isWebsiteBuilderAppRoute("/sites")).toBe(true);
    expect(isWebsiteBuilderAppRoute("/sites/site_1/editor/page_1")).toBe(true);
    expect(isWebsiteBuilderAppRoute("/dashboard")).toBe(false);
    expect(isWebsiteBuilderAppRoute("/websites-other")).toBe(false);
  });

  it("hides every destination when permissions are missing or empty", () => {
    expect(visibleWebsiteBuilderNavGroups(undefined)).toEqual([]);
    expect(visibleWebsiteBuilderNavGroups(null)).toEqual([]);
    expect(visibleWebsiteBuilderNavGroups([])).toEqual([]);
  });

  it("filters each destination by its own capability", () => {
    const sitesReadOnly = visibleWebsiteBuilderNavGroups([
      PERMISSIONS.WEBSITE_BUILDER.SITES_READ,
    ]);
    expect(sitesReadOnly[0]?.items.map((item) => item.id)).toEqual(["overview"]);

    const leadsReadOnly = visibleWebsiteBuilderNavGroups([
      PERMISSIONS.WEBSITE_BUILDER.LEADS_READ,
    ]);
    expect(leadsReadOnly[0]?.items.map((item) => item.id)).toEqual(["inquiries"]);

    const settingsOnly = visibleWebsiteBuilderNavGroups([
      PERMISSIONS.WEBSITE_BUILDER.SITES_WRITE,
    ]);
    expect(settingsOnly[0]?.items.map((item) => item.id)).toEqual(["settings"]);

    const all = visibleWebsiteBuilderNavGroups(ALL_CAPABILITIES);
    expect(all.flatMap((group) => group.items.map((item) => item.id))).toEqual([
      "overview",
      "inquiries",
      "settings",
    ]);
  });
});

describe("WebsiteBuilderNav rendering", () => {
  beforeEach(() => {
    navigation.pathname = "/websites";
  });

  it("renders the hub destinations and marks the active route", () => {
    render(<WebsiteBuilderNav userPermissions={ALL_CAPABILITIES} />);

    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("href")).toBe(
      "/websites"
    );
    expect(
      screen.getByRole("link", { name: "Inquiries" }).getAttribute("href")
    ).toBe("/websites/inquiries");
    expect(
      screen.getByRole("link", { name: "Settings" }).getAttribute("href")
    ).toBe("/websites/settings");
    expect(
      screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: WEBSITE_BUILDER_BACK_LINK.label }).getAttribute("href")
    ).toBe("/dashboard");
  });

  it("renders only the destinations the member may open", () => {
    render(
      <WebsiteBuilderNav
        userPermissions={[PERMISSIONS.WEBSITE_BUILDER.SITES_READ]}
      />
    );

    expect(screen.queryByRole("link", { name: "Inquiries" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    expect(screen.getByRole("link", { name: "Overview" })).toBeTruthy();
  });

  it("renders no destination links when permissions are absent", () => {
    render(<WebsiteBuilderNav userPermissions={[]} />);

    expect(screen.queryByRole("link", { name: "Overview" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Inquiries" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    expect(
      screen.getByRole("link", { name: WEBSITE_BUILDER_BACK_LINK.label })
    ).toBeTruthy();
  });

  it("renders the compact switcher for narrow viewports", () => {
    render(<WebsiteBuilderNav variant="compact" userPermissions={ALL_CAPABILITIES} />);

    expect(
      screen.getByRole("navigation", { name: "Website Builder destinations" })
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Overview" })).toBeTruthy();
  });
});

describe("DashboardShell application hub wiring", () => {
  const TENANT = {
    organizationId: "org_wb_1",
    organizationName: "Riverview",
    userName: "Operator",
    userEmail: "operator@example.com",
    userEmailVerified: true,
    userPermissions: ALL_CAPABILITIES,
  };

  const INSTALLED = [
    {
      id: "website-builder",
      name: "Website Builder",
      href: "/sites",
      icon: "sites",
      description: "Website Builder",
      permission: PERMISSIONS.WEBSITE_BUILDER.SITES_READ,
    },
  ];

  it("collapses the workspace rail and docks the app destinations inside the app", () => {
    const html = renderToString(
      <DashboardShell tenant={TENANT} initialInstalledApps={INSTALLED}>
        <div>Hub content</div>
      </DashboardShell>
    );

    expect(html).toContain("w-16");
    expect(html).toContain("Overview");
    expect(html).toContain("Inquiries");
    expect(html).toContain("Settings");
    expect(html).toContain(WEBSITE_BUILDER_BACK_LINK.label);
    expect(html).toContain("Hub content");
  });

  it("does not render the application hub for a tenant without the installation", () => {
    const html = renderToString(
      <DashboardShell tenant={TENANT} initialInstalledApps={[]}>
        <div>Workspace content</div>
      </DashboardShell>
    );

    expect(html).toContain("w-52 sm:w-56");
    expect(html).not.toContain(WEBSITE_BUILDER_BACK_LINK.label);
    expect(html).toContain("Workspace content");
  });
});
