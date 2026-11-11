// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { InquiriesWorkspace } from "@/components/inquiries/inquiries-workspace";
import { InquiryDetailDrawer } from "@/components/inquiries/inquiry-detail";

const SITE_TITLE = "Riverview Bistro";
const EMAIL = "jane.doe@example.org";
const SITE = {
  id: "site_1",
  title: SITE_TITLE,
  slug: "riverview-bistro",
  status: "PUBLISHED",
  timezone: "UTC",
  primaryDomain: "riverview.example.com",
  pageCount: 1,
  homePageId: "page_home",
  updatedAt: "2026-11-11T10:00:00.000Z",
};

const INQUIRY_ID = "inq_1";
const PREVIEW = "Please call me about a booking.";

const INQUIRY = {
  id: INQUIRY_ID,
  siteId: "site_1",
  pageId: "page_contact",
  blockId: "block_contact",
  status: "NEW",
  preview: PREVIEW,
  submittedAt: "2026-11-11T10:00:00.000Z",
  readAt: null,
  archivedAt: null,
  retentionExpiresAt: "2027-11-11T10:00:00.000Z",
};

const HIDDEN_DETAIL = {
  ...INQUIRY,
  payload: { name: null, email: null, message: PREVIEW },
  contact: null,
  contactRedacted: true,
};

const REVEALED_DETAIL = {
  ...INQUIRY,
  payload: {
    name: "Jane Doe",
    email: EMAIL,
    message: PREVIEW,
  },
  contact: { name: "Jane Doe", email: EMAIL, phone: null },
  contactRedacted: false,
};

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
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

function mockWorkspaceFetch(): void {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url.startsWith("/api/cms/sites")) {
      return Promise.resolve(jsonResponse({ sites: [SITE], nextCursor: null }));
    }
    if (url.startsWith("/api/cms/inquiries?")) {
      return Promise.resolve(jsonResponse({ items: [INQUIRY], nextCursor: null }));
    }
    if (url.startsWith("/api/cms/inquiries/" + INQUIRY_ID + "?revealPii=true")) {
      return Promise.resolve(jsonResponse({ inquiry: REVEALED_DETAIL }));
    }
    if (url.startsWith("/api/cms/inquiries/" + INQUIRY_ID)) {
      return Promise.resolve(jsonResponse({ inquiry: HIDDEN_DETAIL }));
    }
    return Promise.resolve(jsonResponse({ count: 1 }));
  });
}

function renderDrawer(canRevealPii: boolean): void {
  render(
    <InquiryDetailDrawer
      inquiryId={INQUIRY_ID}
      canRevealPii={canRevealPii}
      siteName={SITE_TITLE}
      siteTimeZone="UTC"
      onClose={() => undefined}
      onChanged={() => undefined}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Inquiries list", () => {
  it("renders a genuine empty state when a workspace has no enquiries", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.startsWith("/api/cms/sites")) {
        return Promise.resolve(jsonResponse({ sites: [], nextCursor: null }));
      }
      return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
    });
    render(<InquiriesWorkspace canRevealPii={false} />);
    expect(await screen.findByText("No inquiries yet")).toBeTruthy();
    expect(screen.getByText("Every enquiry captured by this workspace's websites. Contact details stay hidden until revealed.")).toBeTruthy();
  });

  it("renders an enquiry row with a plain-text status and opens its detail", async () => {
    mockWorkspaceFetch();
    render(<InquiriesWorkspace canRevealPii={false} />);
    expect(await screen.findByText(PREVIEW)).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Open inquiry" }));
    expect(await screen.findByText("Contact details are hidden")).toBeTruthy();
  });

  it("filters the list by status through the declared filter configuration", async () => {
    mockWorkspaceFetch();
    render(<InquiriesWorkspace canRevealPii={false} />);
    await screen.findByText(PREVIEW);
    const statusFilter = screen.getAllByRole("button", { name: /^Status/ })[0];
    if (statusFilter === undefined) {
      throw new Error("The status filter is not rendered.");
    }
    fireEvent.click(statusFilter);
    fireEvent.click(await screen.findByRole("option", { name: "Archived" }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).includes("status=ARCHIVED"))
      ).toBe(true);
    });
  });
});

describe("Inquiry detail and the PII gate", () => {
  it("hides contact fields and offers no reveal without cms:leads:pii", async () => {
    mockWorkspaceFetch();
    renderDrawer(false);
    expect(await screen.findByText("Contact details are hidden")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reveal contact details" })).toBeNull();
  });

  it("reveals contact fields with cms:leads:pii and shows the audited values", async () => {
    mockWorkspaceFetch();
    renderDrawer(true);
    fireEvent.click(await screen.findByRole("button", { name: "Reveal contact details" }));
    expect((await screen.findAllByText(EMAIL)).length).toBeGreaterThan(0);
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes("revealPii=true"))
    ).toBe(true);
  });

  it("presents the verbatim RFC 7807 detail when the reveal is denied", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("revealPii=true")) {
        return Promise.resolve(
          jsonResponse(
            {
              type: "/errors/capability-denied",
              title: "Capability denied",
              status: 403,
              code: "CAPABILITY_DENIED",
              detail: "Reading inquiry contact details requires the cms:leads:pii capability.",
            },
            403
          )
        );
      }
      return Promise.resolve(jsonResponse({ inquiry: HIDDEN_DETAIL }));
    });
    renderDrawer(true);
    fireEvent.click(await screen.findByRole("button", { name: "Reveal contact details" }));
    expect(
      await screen.findByText("Reading inquiry contact details requires the cms:leads:pii capability.")
    ).toBeTruthy();
  });
});
