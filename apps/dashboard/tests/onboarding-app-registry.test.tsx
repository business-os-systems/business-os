import React from "react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { getAppManifest } from "@suite/core";
import OnboardingStep2Page from "../src/app/onboarding/step-2/page";
import { AppSelectionCard } from "../src/components/onboarding/app-selection-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const WEBSITE_BUILDER_APP_ID = "website-builder";
const PICKER_SOURCE_URL = new URL(
  "../src/app/onboarding/step-2/page.tsx",
  import.meta.url
);

describe("onboarding app picker registry", () => {
  it("renders the registered application with its target industries", () => {
    const html = renderToString(<OnboardingStep2Page />);
    const manifest = getAppManifest(WEBSITE_BUILDER_APP_ID);
    if (!manifest) {
      throw new Error("The Website Builder manifest must be registered.");
    }

    expect(html).toContain("Recommended for your industry");
    expect(html).toContain(manifest.title.replaceAll("&", "&amp;"));
    expect(html).toContain(manifest.description);
    expect(html).toContain("All industries");
  });

  it("renders a non-recommended card with its category", () => {
    const manifest = getAppManifest(WEBSITE_BUILDER_APP_ID);
    if (manifest === undefined) throw new Error("Manifest missing");
    const app = {
      ...manifest,
      category: "Core Suite",
      targetIndustries: ["Hospitality & Lodging"],
    };
    const html = renderToString(
      <AppSelectionCard
        app={app}
        isSelected={false}
        isRecommended={false}
        onToggle={() => undefined}
      />,
    );
    expect(html).toContain("Core Suite");
    expect(html).toContain("Hospitality &amp; Lodging");
  });

  it("omits applications that the compiled registry does not declare", () => {
    const html = renderToString(<OnboardingStep2Page />);

    expect(html).not.toContain("Property &amp; Room Management");
    expect(html).not.toContain("Point of Sale &amp; Checkout");
    expect(html).not.toContain("Additional workspace applications");
  });

  it("keeps no hardcoded app array or emoji fallback in the picker source", () => {
    const source = readFileSync(PICKER_SOURCE_URL, "utf8");

    expect(source).toContain("@/lib/onboarding-apps");
    expect(source).not.toMatch(/const APP_CATALOG/);
    expect(source).not.toMatch(/targetIndustries:\s*\[/);
    expect(source).not.toMatch(/icon:\s*"/);
    expect(source).not.toMatch(
      /lodging-pms|retail-pos|inventory-manager|customer-crm|financial-ledger|executive-analytics|hr-payroll/
    );
    expect(source).not.toMatch(/🌐|🏨|💳|📦|👥|📊|📈/u);
  });
});
