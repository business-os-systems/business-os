import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { PERMISSIONS } from "@suite/core";
import StudioLayout from "../src/app/(studio)/layout";
import ReviewLayout from "../src/app/(studio)/sites/[siteId]/review/layout";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  evaluateWebsiteBuilderAccess: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/website-builder-access", () => ({
  evaluateWebsiteBuilderAccess: mocks.evaluateWebsiteBuilderAccess,
}));

const SESSION = {
  userId: "usr_wt373_owner",
  organizationId: "org_wt373",
  organizationName: "WT373 Workspace",
  userName: "Owner",
  email: "owner@wt373.example",
  role: "owner",
  onboardingStatus: "COMPLETED",
  timestamp: Date.now(),
};

const SITES_READ = PERMISSIONS.WEBSITE_BUILDER.SITES_READ;
const SURFACE_CONTENT = "studio surface content";

interface SurfaceLayoutProps {
  readonly children: React.ReactNode;
}

type SurfaceLayout = (
  props: SurfaceLayoutProps
) => Promise<React.ReactElement>;

async function renderLayout(Layout: SurfaceLayout): Promise<string> {
  const element = await Layout({ children: <div>{SURFACE_CONTENT}</div> });
  return renderToString(element);
}

const SURFACES: readonly { readonly name: string; readonly Layout: SurfaceLayout }[] = [
  { name: "studio", Layout: StudioLayout },
  { name: "review", Layout: ReviewLayout },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue(SESSION);
});

describe("Website Builder installation gate on studio surfaces (F5, FR-013, T142)", () => {
  it.each(SURFACES)(
    "denies the $name surface when the tenant has not installed the application",
    async ({ Layout }) => {
      mocks.evaluateWebsiteBuilderAccess.mockResolvedValue({
        kind: "denied",
        reason: "app_not_installed",
      });

      const html = await renderLayout(Layout);

      expect(html).toContain("Website Builder is not installed");
      expect(html).not.toContain(SURFACE_CONTENT);
      expect(mocks.evaluateWebsiteBuilderAccess).toHaveBeenCalledWith({
        actor: SESSION,
        capability: SITES_READ,
      });
    }
  );

  it.each(SURFACES)(
    "denies the $name surface when entitlements cannot be verified",
    async ({ Layout }) => {
      mocks.evaluateWebsiteBuilderAccess.mockResolvedValue({
        kind: "denied",
        reason: "entitlements_unavailable",
      });

      const html = await renderLayout(Layout);

      expect(html).toContain("Website Builder is unavailable");
      expect(html).not.toContain(SURFACE_CONTENT);
    }
  );

  it.each(SURFACES)(
    "renders the $name surface for an installed tenant",
    async ({ Layout }) => {
      mocks.evaluateWebsiteBuilderAccess.mockResolvedValue({
        kind: "granted",
        permissions: [PERMISSIONS.WILDCARD],
      });

      const html = await renderLayout(Layout);

      expect(html).toContain(SURFACE_CONTENT);
      expect(html).not.toContain("Website Builder is not installed");
    }
  );
});
