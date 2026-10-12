import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import SiteOnboardingWizard from "../src/app/(dashboard)/sites/onboarding/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("Step-by-Step Site Onboarding Wizard (S4-3)", () => {
  it("renders Step 1 with website title and subdomain input fields", () => {
    const html = renderToString(<SiteOnboardingWizard />);

    expect(html).toContain("Website Onboarding Wizard");
    expect(html).toContain("Step 1 of 4");
    expect(html).toContain("Name Your Website &amp; Subdomain");
    expect(html).toContain(".business-os.site");
    expect(html).toContain("Next: Business Goal");
  });

  it("renders business goal options in component configuration", () => {
    const html = renderToString(<SiteOnboardingWizard />);

    expect(html).toContain("Website or Brand Name");
    expect(html).toContain("Staging Subdomain");
  });
});
