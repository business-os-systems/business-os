// @vitest-environment jsdom
/* global HTMLFormElement */
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateSiteWizard } from "../src/components/sites/create-site-wizard";

const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

const NOW = "2026-11-11T00:00:00.000Z";

const TEMPLATES = [
  {
    id: "tpl_bistro",
    name: "Bistro starter",
    slug: "bistro-starter",
    category: "hospitality",
    industries: ["hospitality"],
    currentVersion: 2,
    previewRef: null,
  },
];

const SITE = {
  id: "site_river",
  organizationId: "org_1",
  branchId: null,
  title: "Riverview Bistro",
  slug: "riverview-bistro",
  status: "DRAFT",
  timezone: "Asia/Kolkata",
  primaryLocale: "en",
  pagesCount: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

function jsonResponse(body: unknown, status: number): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function readJsonBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") {
    throw new Error("Expected a JSON string request body.");
  }
  return JSON.parse(body);
}

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

// jsdom does not implement requestSubmit on every version the suite uses.
if (typeof HTMLFormElement.prototype.requestSubmit !== "function") {
  HTMLFormElement.prototype.requestSubmit = function requestSubmit(): void {
    this.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  };
}

it("opens the studio on the new home page after provisioning", async () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
  fetchMock.mockImplementation(() =>
    jsonResponse(
      {
        success: true,
        data: {
          site: SITE,
          homePage: { id: "page_home", title: "Home", path: "/" },
          pageCount: 1,
          replayed: false,
        },
        requestId: "trace_wizard",
        timestamp: NOW,
      },
      201,
    ),
  );
  vi.stubGlobal("fetch", fetchMock);

  render(
    <CreateSiteWizard domainRoot="example.test" templates={TEMPLATES} templatesError={null} />,
  );

  fireEvent.change(screen.getByLabelText(/Site name/), {
    target: { value: "Riverview Bistro" },
  });
  fireEvent.change(screen.getByLabelText(/Address/), {
    target: { value: "riverview-bistro" },
  });
  fireEvent.click(screen.getByLabelText(/Starting point/));
  fireEvent.click(screen.getByRole("option", { name: "Bistro starter (hospitality)" }));

  fireEvent.click(
    screen.getByRole("button", {
      name: "Create site and open studio",
    }),
  );

  await waitFor(
    () => {
      expect(push).toHaveBeenCalledWith("/dashboard/sites/site_river/studio/page_home");
    },
    { timeout: 3000 },
  );

  const [, request] = fetchMock.mock.calls[0] ?? [];
  expect(new Headers(request?.headers).get("Idempotency-Key")).toEqual(expect.any(String));
  expect(readJsonBody(request?.body)).toEqual({
    title: "Riverview Bistro",
    slug: "riverview-bistro",
    templateId: "tpl_bistro",
  });
});
