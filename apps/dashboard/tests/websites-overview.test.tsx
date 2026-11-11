// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
}));

import { WebsiteOverview } from "@/app/(dashboard)/websites/website-overview";

const CREATE_WEBSITE = "Create website";
const SITE_TITLE = "Riverview Bistro";
const SITE = {
  id: "site_1",
  title: SITE_TITLE,
  slug: "riverview-bistro",
  status: "PUBLISHED",
  timezone: "UTC",
  primaryDomain: "riverview.example.com",
  pageCount: 6,
  homePageId: "page_home",
  updatedAt: "2026-11-11T10:00:00.000Z",
};

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Website Builder overview loading and empty states", () => {
  it("shows a loading state before any site exists in client state", () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined));

    render(<WebsiteOverview />);

    expect(screen.getByRole("status", { name: "Loading websites" })).toBeTruthy();
    expect(screen.queryByText(SITE_TITLE)).toBeNull();
  });

  it("renders the genuine empty state when the tenant has no sites", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ sites: [], nextCursor: null }));

    render(<WebsiteOverview />);

    expect(await screen.findByText("No websites yet")).toBeTruthy();
    expect(
      screen.getByText("Create your first website to start building pages in the studio.")
    ).toBeTruthy();
  });
});

describe("Website Builder overview populated and error states", () => {
  it("renders real sites with address, status, pages and the direct studio link", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ sites: [SITE], nextCursor: null })
    );

    render(<WebsiteOverview />);

    expect(await screen.findByText(SITE_TITLE)).toBeTruthy();
    expect(screen.getByText("riverview.example.com")).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.getByText("6 pages")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open studio" }).getAttribute("href")).toBe(
      "/sites/site_1/editor/page_home"
    );
  });

  it("presents the RFC 7807 detail instead of masking the server failure", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          type: "/errors/capability-denied",
          title: "Capability Denied",
          status: 403,
          code: "CAPABILITY_DENIED",
          detail: "Your role does not allow reading websites.",
        },
        403
      )
    );

    render(<WebsiteOverview />);

    expect(
      await screen.findByText("Your role does not allow reading websites.")
    ).toBeTruthy();
    expect(screen.queryByText("No websites yet")).toBeNull();
  });
});

describe("Website Builder overview pagination and actions", () => {
  it("loads the next page from the returned cursor", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ sites: [SITE], nextCursor: "cursor_2" }))
      .mockResolvedValueOnce(
        jsonResponse({
          sites: [{ ...SITE, id: "site_2", title: "Riverview Events" }],
          nextCursor: null,
        })
      );

    render(<WebsiteOverview />);

    expect(await screen.findByText(SITE_TITLE)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Riverview Events")).toBeTruthy();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/cms/sites?limit=25&cursor=cursor_2",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("sends the member to site creation from the overview header", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ sites: [], nextCursor: null }));

    render(<WebsiteOverview />);
    await screen.findByText("No websites yet");
    const createButton = screen
      .getAllByRole("button", { name: CREATE_WEBSITE })
      .at(0);
    if (createButton === undefined) {
      throw new Error("expected a create website button");
    }
    fireEvent.click(createButton);

    expect(navigation.push).toHaveBeenCalledWith("/sites/onboarding");
  });
});
