import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { SupportSessionClientError } from "../src/lib/support-session-client";
import SecuritySettingsPage from "../src/app/(dashboard)/settings/security/page";

const mocks = vi.hoisted(() => ({
  fetchHistory: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/support-session-client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../src/lib/support-session-client")>();
  return { ...original, fetchSupportSessionHistory: mocks.fetchHistory };
});

const HISTORY_ITEM = {
  ticketId: "7c5f9f6e-2f1a-4f4c-9d2a-5b6f8c1d3e4f",
  operatorDisplayName: "Duty Operator",
  reason: "Investigating the billing discrepancy reported in SUP-237.",
  ticketRef: "SUP-237",
  startedAt: "2026-11-09T13:00:00.000Z",
  expiresAt: "2026-11-09T13:30:00.000Z",
  endedAt: null,
  endedBy: null,
};

async function renderPage(
  searchParams?: { cursor?: string | string[] }
): Promise<string> {
  const element = await SecuritySettingsPage({
    searchParams: Promise.resolve(searchParams),
  });
  return renderToString(element);
}

beforeEach(() => {
  mocks.requireAuth.mockResolvedValue({
    userId: "usr_workspace_admin",
    organizationId: "org_support_probe",
  });
  mocks.fetchHistory.mockResolvedValue({
    items: [HISTORY_ITEM],
    nextCursor: "older-cursor",
  });
});

describe("Tenant security settings page (FR-049)", () => {
  it("renders the org-scoped history on the first page", async () => {
    const html = await renderPage();

    expect(html).toContain("Security");
    expect(html).toContain(
      "Review every read-only support session that touched this workspace."
    );
    expect(html).toContain("Duty Operator");
    expect(html).toContain("Older sessions");
    expect(mocks.fetchHistory).toHaveBeenCalledWith({ limit: 20 });
  });

  it("carries the cursor from the query string into the API read", async () => {
    const html = await renderPage({ cursor: "older-cursor" });

    expect(html).toContain("Newest sessions");
    expect(mocks.fetchHistory).toHaveBeenCalledWith({
      cursor: "older-cursor",
      limit: 20,
    });
  });

  it("ignores a repeated query parameter instead of guessing", async () => {
    await renderPage({ cursor: ["first", "second"] });

    expect(mocks.fetchHistory).toHaveBeenCalledWith({ limit: 20 });
  });

  it("shows the RFC 7807 detail when the API refuses the read", async () => {
    mocks.fetchHistory.mockRejectedValueOnce(
      new SupportSessionClientError("Capability denied.", {
        status: 403,
        code: "CAPABILITY_DENIED",
      })
    );

    const html = await renderPage();

    expect(html).toContain("Could not load support-session history");
    expect(html).toContain("Capability denied.");
  });

  it("keeps transport details out of the page and logs them", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.fetchHistory.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const html = await renderPage();

    expect(html).toContain("The support-session history could not be read.");
    expect(html).not.toContain("ECONNREFUSED");
    expect(consoleSpy).toHaveBeenCalledWith(
      "Support-session history read failed:",
      "connect ECONNREFUSED"
    );
    consoleSpy.mockRestore();
  });
});
