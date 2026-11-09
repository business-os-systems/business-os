import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import DashboardLayout from "../src/app/(dashboard)/layout";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  tenantContext: vi.fn(),
  fetchActive: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/services/tenant-context.service", () => ({
  getDashboardTenantContext: mocks.tenantContext,
}));
vi.mock("@/lib/support-session-client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../src/lib/support-session-client")>();
  return { ...original, fetchActiveSupportSession: mocks.fetchActive };
});

const TENANT = {
  organizationId: "org_support_probe",
  organizationName: "Acme Workspace",
  userName: "Duty Operator",
  userEmail: "operator@example.com",
  userEmailVerified: true,
  userPermissions: ["core:organization:read"],
};

const SESSION = {
  ticketId: "7c5f9f6e-2f1a-4f4c-9d2a-5b6f8c1d3e4f",
  operatorDisplayName: "Duty Operator",
  reason: "Investigating the billing discrepancy reported in SUP-237.",
  ticketRef: "SUP-237",
  startedAt: "2026-11-09T13:00:00.000Z",
  expiresAt: "2026-11-09T13:30:00.000Z",
};

async function renderLayout(): Promise<string> {
  const element = await DashboardLayout({
    children: <div>tenant workspace content</div>,
  });
  return renderToString(element);
}

beforeEach(() => {
  mocks.requireAuth.mockResolvedValue({
    userId: "usr_support_probe",
    organizationId: "org_support_probe",
  });
  mocks.tenantContext.mockResolvedValue({
    tenant: TENANT,
    installedApps: [],
    blockedStatus: null,
  });
  mocks.fetchActive.mockResolvedValue(null);
});

describe("Dashboard support-session banner mount (FR-048)", () => {
  it("renders the workspace without a banner when no session is active", async () => {
    const html = await renderLayout();

    expect(html).toContain("tenant workspace content");
    expect(html).not.toContain("Support session active");
  });

  it("renders the non-dismissible banner while a session is active", async () => {
    mocks.fetchActive.mockResolvedValueOnce(SESSION);

    const html = await renderLayout();

    expect(html).toContain("tenant workspace content");
    expect(html).toContain("Support session active");
    expect(html).toContain("09 Nov 2026, 13:30 UTC");
  });

  it("renders the workspace and logs when the session read fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.fetchActive.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const html = await renderLayout();

    expect(html).toContain("tenant workspace content");
    expect(html).not.toContain("Support session active");
    expect(consoleSpy).toHaveBeenCalledWith(
      "Active support-session read failed:",
      "connect ECONNREFUSED"
    );
    consoleSpy.mockRestore();
  });
});
