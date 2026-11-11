import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import SiteOnboardingPage from "../src/app/(dashboard)/sites/onboarding/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Site onboarding is the one create-site surface", () => {
  it("renders the config-driven create-site wizard on the linked route", () => {
    vi.stubEnv("DOMAIN_ROOT", "localhost");
    const html = renderToString(<SiteOnboardingPage />);

    expect(html).toContain("Create a website");
    expect(html).toContain("Name the site");
    expect(html).toContain("Site name");
    expect(html).toContain("Continue");
    expect(html).not.toContain("hero_starter");
  });

  it("fails closed with an explicit message when the host root is unconfigured", () => {
    vi.stubEnv("DOMAIN_ROOT", "");

    const html = renderToString(<SiteOnboardingPage />);

    expect(html).toContain("tenant host root is not configured");
    expect(html).not.toContain("Create a website");
  });
});
