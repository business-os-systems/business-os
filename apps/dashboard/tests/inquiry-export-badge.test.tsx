// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PERMISSIONS } from "@suite/core";

vi.mock("next/navigation", () => ({
  usePathname: () => "/websites/inquiries",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { InquiriesWorkspace } from "@/components/inquiries/inquiries-workspace";
import { WebsiteBuilderNav } from "@/components/layout/website-builder-nav";
import { WEBSITE_BUILDER_NAV_GROUPS } from "@/components/layout/website-builder-nav.config";

const SITE = {
  id: "site_1",
  title: "Riverview Bistro",
  slug: "riverview-bistro",
  status: "PUBLISHED",
  timezone: "UTC",
  primaryDomain: "riverview.example.com",
  pageCount: 1,
  homePageId: "page_home",
  updatedAt: "2026-11-11T10:00:00.000Z",
};

const INQUIRY = {
  id: "inq_1",
  siteId: "site_1",
  pageId: "page_contact",
  blockId: "block_contact",
  status: "NEW",
  preview: "Please call me about a booking.",
  submittedAt: "2026-11-11T10:00:00.000Z",
  readAt: null,
  archivedAt: null,
  retentionExpiresAt: "2027-11-11T10:00:00.000Z",
};

const fetchMock = vi.fn();
const createObjectUrl = vi.fn(() => "blob:inquiries");
const revokeObjectUrl = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function csvResponse(): Response {
  return new Response('id,submittedAt,siteId\r\n"inq_1","2026-11-11T10:00:00.000Z","site_1"\r\n', {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="inquiries-test.csv"',
    },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function mockInquiryWorkspace(): void {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url.startsWith("/api/cms/sites")) {
      return Promise.resolve(jsonResponse({ sites: [SITE], nextCursor: null }));
    }
    if (url.startsWith("/api/cms/inquiries/export")) {
      return Promise.resolve(csvResponse());
    }
    if (url.startsWith("/api/cms/inquiries?")) {
      return Promise.resolve(jsonResponse({ items: [INQUIRY], nextCursor: null }));
    }
    return Promise.resolve(jsonResponse({ count: 0 }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectUrl,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectUrl,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Inquiry export UI", () => {
  it("downloads the filtered CSV when the actor holds cms:leads:pii", async () => {
    mockInquiryWorkspace();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(<InquiriesWorkspace canRevealPii />);

    fireEvent.click(await screen.findByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).startsWith("/api/cms/inquiries/export")
        )
      ).toBe(true);
    });
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it("renders no export control without cms:leads:pii", async () => {
    mockInquiryWorkspace();
    render(<InquiriesWorkspace canRevealPii={false} />);
    await screen.findByText("Please call me about a booking.");
    expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull();
  });

  it("shows the genuine RFC 7807 detail when the export is refused", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.startsWith("/api/cms/sites")) {
        return Promise.resolve(jsonResponse({ sites: [SITE], nextCursor: null }));
      }
      if (url.startsWith("/api/cms/inquiries/export")) {
        return Promise.resolve(
          jsonResponse(
            {
              type: "/errors/capability-denied",
              title: "Capability denied",
              status: 403,
              code: "CAPABILITY_DENIED",
              detail: "Exporting inquiry personal data requires the cms:leads:pii capability.",
            },
            403
          )
        );
      }
      return Promise.resolve(jsonResponse({ items: [INQUIRY], nextCursor: null }));
    });
    render(<InquiriesWorkspace canRevealPii />);
    fireEvent.click(await screen.findByRole("button", { name: "Export CSV" }));
    expect(
      await screen.findByText(
        "Exporting inquiry personal data requires the cms:leads:pii capability."
      )
    ).toBeTruthy();
  });
});

describe("Inquiries navigation badge", () => {
  it("declares the unread badge on the Inquiries destination in configuration", () => {
    const inquiries = WEBSITE_BUILDER_NAV_GROUPS.flatMap((group) => group.items).find(
      (item) => item.id === "inquiries"
    );
    expect(inquiries?.badge).toBe("inquiry-unread-count");
  });

  it("renders the unread count from the destination configuration", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ count: 3 }));
    render(
      <WebsiteBuilderNav
        userPermissions={[PERMISSIONS.WEBSITE_BUILDER.LEADS_READ]}
      />
    );
    expect(await screen.findByLabelText("3 unread inquiries")).toBeTruthy();
  });

  it("renders no badge when the count read fails", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          type: "/errors/capability-denied",
          title: "Capability denied",
          status: 403,
          code: "CAPABILITY_DENIED",
          detail: "Denied.",
        },
        403
      )
    );
    render(
      <WebsiteBuilderNav
        userPermissions={[PERMISSIONS.WEBSITE_BUILDER.LEADS_READ]}
      />
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.queryByLabelText(/unread inquiries/)).toBeNull();
  });
});
