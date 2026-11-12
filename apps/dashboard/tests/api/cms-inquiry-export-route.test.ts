import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as exportGET } from "../../src/app/api/cms/inquiries/export/route";

const sessionMocks = vi.hoisted(() => ({ getAuthenticatedSession: vi.fn() }));
const accessMocks = vi.hoisted(() => ({ evaluateWebsiteBuilderAccess: vi.fn() }));
const exportMocks = vi.hoisted(() => ({ exportTenantInquiries: vi.fn() }));

vi.mock("@/lib/session-helper", () => ({
  getAuthenticatedSession: sessionMocks.getAuthenticatedSession,
}));
vi.mock("@/lib/website-builder-access", () => ({
  evaluateWebsiteBuilderAccess: accessMocks.evaluateWebsiteBuilderAccess,
}));
vi.mock("@suite/website-builder/inquiries", () => ({
  exportTenantInquiries: exportMocks.exportTenantInquiries,
}));

const SESSION = {
  userId: "usr_export_1",
  organizationId: "org_export_1",
  organizationName: "Riverview",
  permissions: ["cms:leads:pii"],
};

function request(query = ""): NextRequest {
  return new NextRequest("https://app.example.com/api/cms/inquiries/export" + query);
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionMocks.getAuthenticatedSession.mockResolvedValue({ ok: true, session: SESSION });
  accessMocks.evaluateWebsiteBuilderAccess.mockResolvedValue({
    kind: "granted",
    permissions: ["cms:leads:pii"],
  });
  exportMocks.exportTenantInquiries.mockResolvedValue({
    csv: 'id,submittedAt\r\n"inq_1","2026-11-11T10:00:00.000Z"\r\n',
    rowCount: 1,
    filename: "inquiries-test.csv",
  });
});

describe("inquiry export BFF route", () => {
  it("returns the session problem when the caller is unauthenticated", async () => {
    sessionMocks.getAuthenticatedSession.mockResolvedValue({
      ok: false,
      response: new Response("denied", { status: 401 }),
    });
    const response = await exportGET(request());
    expect(response.status).toBe(401);
    expect(exportMocks.exportTenantInquiries).not.toHaveBeenCalled();
  });

  it("denies the export when the gate refuses cms:leads:pii", async () => {
    accessMocks.evaluateWebsiteBuilderAccess.mockResolvedValue({
      kind: "denied",
      reason: "capability_denied",
    });
    const response = await exportGET(request());
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe("CAPABILITY_DENIED");
    expect(exportMocks.exportTenantInquiries).not.toHaveBeenCalled();
  });

  it("streams the CSV for the session's workspace only", async () => {
    const response = await exportGET(request("?status=NEW&siteId=site_1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain("inquiries-test.csv");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("inq_1");
    expect(exportMocks.exportTenantInquiries).toHaveBeenCalledWith({
      organizationId: SESSION.organizationId,
      siteId: "site_1",
      status: "NEW",
      actorUserId: SESSION.userId,
    });
  });

  it("rejects an invalid status filter before reading any row", async () => {
    const response = await exportGET(request("?status=DELETED"));
    expect(response.status).toBe(400);
    expect(exportMocks.exportTenantInquiries).not.toHaveBeenCalled();
  });
});
