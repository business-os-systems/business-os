import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import LoginPage from "../src/app/(auth)/login/page";
import OverviewPage from "../src/app/(dashboard)/page";
import { HeaderTopbar } from "../src/components/layout/header-topbar";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/login",
}));

describe("Platform Auth Gate & Login Route (@suite/dashboard)", () => {
  describe("LoginPage Component", () => {
    it("renders the login card with brand identity and credentials form", () => {
      const html = renderToString(<LoginPage />);

      expect(html).toContain("Business OS");
      expect(html).toContain("Sign In to Workspace");
      expect(html).toContain("operator@company.com");
      expect(html).toContain("Auto-fill demo credentials");
      expect(html).toContain("TLS Encrypted");
    });
  });

  describe("Workspace App Launcher (OverviewPage)", () => {
    it("renders Executive App Launcher heading and dynamic subtitle", () => {
      const html = renderToString(<OverviewPage />);

      expect(html).toContain("Executive App Launcher");
      expect(html).toContain("Welcome to your Business OS workspace");
    });

    it("renders Website Builder as Available with active Open Application link", () => {
      const html = renderToString(<OverviewPage />);

      expect(html).toContain("Website Builder &amp; Headless CMS");
      expect(html).toContain("Available");
      expect(html).toContain("Open Application");
      expect(html).toContain("href=\"/sites\"");
    });

    it("renders upcoming modular apps with Coming Soon status", () => {
      const html = renderToString(<OverviewPage />);

      expect(html).toContain("Lodging Property Management (PMS)");
      expect(html).toContain("Restaurant POS &amp; KDS");
      expect(html).toContain("Central Inventory &amp; Stock Requisitions");
      expect(html).toContain("Coming Soon");
    });
  });

  describe("HeaderTopbar Sign-Out Action", () => {
    it("renders dynamic tenant name and Sign Out button", () => {
      const html = renderToString(
        <HeaderTopbar
          tenant={{
            organizationId: "org-custom",
            organizationName: "Global Hospitality Holdings",
            activeBranchName: "Main Branch",
          }}
        />
      );

      expect(html).toContain("Global Hospitality Holdings");
      expect(html).toContain("Sign Out");
    });
  });
});
