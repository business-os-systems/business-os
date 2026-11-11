// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccessDenied } from "@/components/layout/access-denied";
import { WebsiteBuilderSettingsPanel } from "@/app/(dashboard)/websites/settings/settings-panel";

describe("Website Builder denial surface", () => {
  it("denies a workspace without the installation instead of showing an empty studio", () => {
    render(<AccessDenied reason="app_not_installed" />);

    expect(screen.getByText("Website Builder is not installed")).toBeTruthy();
    expect(screen.queryByText("No websites yet")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to workspace" }).getAttribute("href")).toBe(
      "/dashboard"
    );
  });

  it("denies a member whose role lacks the destination capability", () => {
    render(<AccessDenied reason="capability_denied" />);

    expect(screen.getByText("You do not have access")).toBeTruthy();
    expect(
      screen.getByText(
        "Your role does not include the capability required to open this Website Builder destination."
      )
    ).toBeTruthy();
  });

  it("denies access when entitlements cannot be verified", () => {
    render(<AccessDenied reason="entitlements_unavailable" />);

    expect(screen.getByText("Website Builder is unavailable")).toBeTruthy();
    expect(
      screen.getByText(
        "We could not verify this workspace's application entitlements. No websites or studio content were loaded."
      )
    ).toBeTruthy();
  });
});

describe("Website Builder settings surface", () => {
  it("renders configuration fields only, never operational site data", () => {
    render(
      <WebsiteBuilderSettingsPanel
        fields={[
          {
            kind: "configured",
            key: "customDomainEnabled",
            label: "Custom domains",
            description: "Allow this tenant to attach custom domains.",
            displayValue: "Enabled",
          },
          {
            kind: "default",
            key: "defaultLocale",
            label: "Default locale",
            description: "Locale used for new sites.",
            displayValue: "Not configured",
          },
        ]}
      />
    );

    expect(screen.getByText("Custom domains")).toBeTruthy();
    expect(screen.getByText("Enabled")).toBeTruthy();
    expect(screen.getByText("Default locale")).toBeTruthy();
    expect(screen.getByText("Not configured")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open studio" })).toBeNull();
    expect(screen.queryByText("Riverview Bistro")).toBeNull();
  });
});
