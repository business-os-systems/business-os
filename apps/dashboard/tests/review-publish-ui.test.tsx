// @vitest-environment jsdom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReviewWorkspace } from "../src/components/review/review-workspace";
import { StudioSiteLinks } from "../src/components/studio/studio-site-links";
import type { CmsProblem } from "../src/lib/api/cms-http";

const SITE_ID = "site_review";
const REVIEW_ID = "review_1";
const EMPTY_AST = { version: 1, schemaVersion: "2026-03", sections: [] };
const REVIEWER = "usr_reviewer";
const FIXED_TIMESTAMP = "2026-11-11T00:00:00.000Z";
const SITE_PATH = "/sites/" + SITE_ID;

function reviewPage(pageId: string, title: string, path: string, changed: boolean) {
  return {
    pageId,
    title,
    path,
    orderIndex: 0,
    status: "DRAFT",
    revision: 2,
    contentUpdatedAt: null,
    changed,
    reviewed: false,
    stale: false,
    draftAst: EMPTY_AST,
    publishedAst: changed ? EMPTY_AST : EMPTY_AST,
  };
}

function reviewResult(canPublish: boolean) {
  return {
    success: true,
    requestId: "req_review",
    timestamp: FIXED_TIMESTAMP,
    data: {
      review: {
        reviewId: REVIEW_ID,
        siteId: SITE_ID,
        status: "READY",
        createdAt: FIXED_TIMESTAMP,
        reviewerUserId: REVIEWER,
        publishedAt: null,
        changedPageCount: 2,
        reviewedPageCount: 0,
        pages: [
          reviewPage("page_home", "Home", "/", true),
          reviewPage("page_menu", "Menu", "/menu", true),
        ],
        media: {},
      },
      canPublish,
      actions: canPublish ? [{ id: "publish", label: "Publish live" }] : [],
    },
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return "";
}

function openedResponse(): Response {
  return jsonResponse(
    {
      success: true,
      requestId: "req_opened",
      timestamp: FIXED_TIMESTAMP,
      data: { pageId: "page_menu", revision: 2, reviewed: true, stale: false },
    },
    200
  );
}

function publishedResponse(): Response {
  return jsonResponse(
    {
      success: true,
      requestId: "req_publish",
      timestamp: FIXED_TIMESTAMP,
      data: {
        siteId: SITE_ID,
        reviewId: REVIEW_ID,
        reviewerUserId: REVIEWER,
        publisherUserId: "usr_publisher",
        publishedAt: FIXED_TIMESTAMP,
        pages: [{ pageId: "page_home", versionNumber: 1, revision: 3 }],
        replayed: false,
      },
    },
    200
  );
}

function installFetch(problem: CmsProblem | null, canPublish = true) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url.endsWith(SITE_PATH + "/review")) {
      return Promise.resolve(jsonResponse(reviewResult(canPublish), 201));
    }
    if (url.includes("/opened")) {
      return Promise.resolve(openedResponse());
    }
    if (url.endsWith(SITE_PATH + "/publish")) {
      if (problem !== null) {
        return Promise.resolve(jsonResponse(problem, problem.status));
      }
      return Promise.resolve(publishedResponse());
    }
    return Promise.reject(new Error("Unexpected request: " + url));
  });
  global.fetch = fetchMock;
  return fetchMock;
}

const STALE_PROBLEM: CmsProblem = {
  type: "/errors/preview-required",
  title: "Preview Required",
  status: 409,
  code: "PREVIEW_REQUIRED",
  detail: "The site changed after this preview. Open a fresh review before publishing.",
};

const VERSION_PROBLEM: CmsProblem = {
  type: "/errors/version-conflict",
  title: "Version Conflict",
  status: 409,
  code: "VERSION_CONFLICT",
  detail: "The page changed while publishing. Open a fresh review.",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("editor publish entry (FR-085, FR-086)", () => {
  it("exposes no direct publish control in the editor; the entry only opens review", () => {
    render(<StudioSiteLinks siteId={SITE_ID} />);
    expect(screen.queryByRole("button", { name: /publish/i })).toBeNull();
    const reviewLink = screen.getByRole("link", { name: /review & publish/i });
    expect(reviewLink.getAttribute("href")).toContain(SITE_PATH + "/review");
  });
});

describe("review and publish surface (FR-087..FR-093)", () => {
  it("renders exactly one live publish control on the review surface", async () => {
    installFetch(null);
    render(<ReviewWorkspace siteId={SITE_ID} />);
    const controls = await screen.findAllByRole("button", { name: /publish live/i });
    expect(controls).toHaveLength(1);
    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("Menu")).toBeTruthy();
  });

  it("navigates every page and switches device widths", async () => {
    installFetch(null);
    render(<ReviewWorkspace siteId={SITE_ID} />);
    await screen.findByText("Menu");
    fireEvent.click(screen.getByText("Menu"));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Mobile" }));
    expect(document.querySelector('[data-review-device="mobile"]')).not.toBeNull();
  });

  it("renders PREVIEW_REQUIRED details verbatim when a review goes stale", async () => {
    installFetch(STALE_PROBLEM);
    render(<ReviewWorkspace siteId={SITE_ID} />);
    fireEvent.click(await screen.findByRole("button", { name: /publish live/i }));
    await screen.findByText(/PREVIEW_REQUIRED/);
    expect(screen.getByText(STALE_PROBLEM.detail)).toBeTruthy();
    expect(screen.getByText(STALE_PROBLEM.type)).toBeTruthy();
  });

  it("renders VERSION_CONFLICT details verbatim", async () => {
    installFetch(VERSION_PROBLEM);
    render(<ReviewWorkspace siteId={SITE_ID} />);
    fireEvent.click(await screen.findByRole("button", { name: /publish live/i }));
    await screen.findByText(/VERSION_CONFLICT/);
    expect(screen.getByText(VERSION_PROBLEM.detail)).toBeTruthy();
  });

  it("gives a preview-only reviewer a read-only review with no publish control", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(reviewResult(false), 201)));
    global.fetch = fetchMock;
    render(<ReviewWorkspace siteId={SITE_ID} />);
    await screen.findByText("Home");
    expect(screen.queryByRole("button", { name: /publish live/i })).toBeNull();
    expect(screen.getByText(/read-only review/i)).toBeTruthy();
  });
});
