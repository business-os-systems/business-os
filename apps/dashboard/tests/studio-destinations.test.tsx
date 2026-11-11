import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { PERMISSIONS } from "@suite/core";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  evaluateWebsiteBuilderAccess: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/website-builder-access", () => ({
  evaluateWebsiteBuilderAccess: mocks.evaluateWebsiteBuilderAccess,
}));

import DomainsPage from "../src/app/(studio)/sites/[siteId]/domains/page";
import InquiriesPage from "../src/app/(studio)/sites/[siteId]/inquiries/page";
import RedirectsPage from "../src/app/(studio)/sites/[siteId]/redirects/page";
import SettingsPage from "../src/app/(studio)/sites/[siteId]/settings/page";

const SESSION = {
  userId: "usr_wt375",
  organizationId: "org_wt375",
  organizationName: "WT375 Workspace",
  userName: "Owner",
  email: "owner@wt375.example",
  role: "owner",
  onboardingStatus: "COMPLETED",
  timestamp: Date.now(),
};

const SITE_ID = "site_wt375";

interface DestinationPageProps {
  readonly params: Promise<{ readonly siteId: string }>;
}

type DestinationPage = (props: DestinationPageProps) => Promise<React.ReactElement>;

const DESTINATIONS: readonly {
  readonly name: string;
  readonly Page: DestinationPage;
  readonly capability: string;
  readonly title: string;
  readonly loading: string;
}[] = [
  {
    name: "site settings",
    Page: SettingsPage,
    capability: PERMISSIONS.WEBSITE_BUILDER.SITES_READ,
    title: "Site settings",
    loading: "Loading site settings...",
  },
  {
    name: "domains",
    Page: DomainsPage,
    capability: PERMISSIONS.WEBSITE_BUILDER.SITES_READ,
    title: "Domains",
    loading: "Loading domains...",
  },
  {
    name: "redirects",
    Page: RedirectsPage,
    capability: PERMISSIONS.WEBSITE_BUILDER.PAGES_READ,
    title: "Redirects",
    loading: "Loading redirects...",
  },
  {
    name: "enquiries",
    Page: InquiriesPage,
    capability: PERMISSIONS.WEBSITE_BUILDER.LEADS_READ,
    title: "Enquiries",
    loading: "Loading enquiries...",
  },
];

async function renderPage(Page: DestinationPage): Promise<string> {
  const element = await Page({ params: Promise.resolve({ siteId: SITE_ID }) });
  return renderToString(element);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DOMAIN_ROOT", "example.test");
  mocks.requireAuth.mockResolvedValue(SESSION);
});

describe("Studio destinations (FR-082, T144)", () => {
  it.each(DESTINATIONS)(
    "renders the $name destination for an installed, capable workspace",
    async ({ Page, capability, title, loading }) => {
      mocks.evaluateWebsiteBuilderAccess.mockResolvedValue({
        kind: "granted",
        permissions: [capability],
      });

      const html = await renderPage(Page);

      expect(html).toContain(title);
      expect(html).toContain(loading);
      expect(html).toContain('href="/dashboard/sites/' + SITE_ID + '/studio"');
      expect(html).not.toContain("Website Builder is not installed");
      expect(mocks.evaluateWebsiteBuilderAccess).toHaveBeenCalledWith({
        actor: SESSION,
        capability,
      });
    }
  );

  it.each(DESTINATIONS)(
    "denies the $name destination when the installation is missing",
    async ({ Page }) => {
      mocks.evaluateWebsiteBuilderAccess.mockResolvedValue({
        kind: "denied",
        reason: "app_not_installed",
      });

      const html = await renderPage(Page);

      expect(html).toContain("Website Builder is not installed");
      expect(html).toContain("Back to workspace");
    }
  );

  it.each(DESTINATIONS)(
    "denies the $name destination when the capability is missing",
    async ({ Page, capability }) => {
      mocks.evaluateWebsiteBuilderAccess.mockResolvedValue({
        kind: "denied",
        reason: "capability_denied",
      });

      const html = await renderPage(Page);

      expect(html).toContain("You do not have access");
      expect(mocks.evaluateWebsiteBuilderAccess).toHaveBeenCalledWith({
        actor: SESSION,
        capability,
      });
    }
  );
});
