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
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

// jsdom does not implement requestSubmit on every version the suite uses.
if (typeof HTMLFormElement.prototype.requestSubmit !== "function") {
  HTMLFormElement.prototype.requestSubmit = function requestSubmit(): void {
    this.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
  };
}

it("opens the studio on the new home page after provisioning", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
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
        201
      )
    )
  );

  render(
    <CreateSiteWizard
      domainRoot="example.test"
      templates={TEMPLATES}
      templatesError={null}
    />
  );

  fireEvent.change(screen.getByLabelText(/Site name/), {
    target: { value: "Riverview Bistro" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  fireEvent.change(await screen.findByLabelText(/Address/), {
    target: { value: "riverview-bistro" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  fireEvent.click(
    await screen.findByRole("button", {
      name: "Create site and open studio",
    })
  );

  await waitFor(
    () => {
      expect(push).toHaveBeenCalledWith(
        "/dashboard/sites/site_river/studio/page_home"
      );
    },
    { timeout: 3000 }
  );
});
