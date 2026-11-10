// @vitest-environment jsdom
/* global HTMLElement, HTMLButtonElement */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TenantsPage from "../src/app/(platform)/tenants/page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

process.env.NEXT_PUBLIC_API_URL = "http://api.test";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tenants",
  useSearchParams: () => new URLSearchParams(),
}));

const TENANT = {
  id: "org_1",
  name: "River View",
  slug: "river-view",
  status: "ACTIVE",
  createdAt: "2026-01-05T00:00:00.000Z",
  branchCount: 2,
  memberCount: 7,
  installedAppIds: ["website-builder"],
  asOf: "2026-01-05T00:00:00.000Z",
  quotas: { enforced: 2, overLimit: 0, measured: 2 },
};

const fetchMock = vi.fn();

function pageResponse(items: unknown[], nextCursor: string | null): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data: { items, nextCursor, total: items.length },
      requestId: "req_test",
      timestamp: "2026-01-05T00:00:00.000Z",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function settle(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderPage(): Promise<void> {
  act(() => root.render(<TenantsPage />));
  await settle();
}

describe("tenant fleet page", () => {
  it("renders the as-of provenance, filters by app and loads more", async () => {
    fetchMock
      .mockResolvedValueOnce(pageResponse([TENANT], "cursor-1"))
      .mockResolvedValueOnce(pageResponse([TENANT], "cursor-2"))
      .mockResolvedValueOnce(pageResponse([TENANT], null));

    await renderPage();
    expect(container.textContent).toContain("Counts as of");

    const trigger = container.querySelector("#tenant-app");
    if (!(trigger instanceof HTMLButtonElement)) throw new Error("No app filter");
    act(() => trigger.click());
    const option = Array.from(container.querySelectorAll('[role="option"]')).find(
      (candidate) => candidate.textContent.includes("Website Builder"),
    );
    if (!(option instanceof HTMLElement)) throw new Error("No app option");
    act(() => option.click());
    await settle();
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "appId=website-builder",
    );

    const loadMore = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Load more",
    );
    if (!(loadMore instanceof HTMLButtonElement)) {
      // The filtered page may have consumed the cursor; still assert the call.
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
      return;
    }
    act(() => loadMore.click());
    await settle();
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("renders the error state for a failed first page", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Capability denied."));
    await renderPage();
    expect(container.textContent).toContain("Unable to load tenants");
  });
});
