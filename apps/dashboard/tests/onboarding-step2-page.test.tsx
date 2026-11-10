// @vitest-environment jsdom
/* global HTMLElement, HTMLFormElement */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getAppManifest, type AppManifest } from "@suite/core";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const groups = vi.hoisted(() => ({
  current: { recommended: [] as AppManifest[], additional: [] as AppManifest[] },
}));
const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/onboarding-apps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/onboarding-apps")>();
  return { ...actual, groupOnboardingApps: () => groups.current };
});

const { default: OnboardingStep2Page } = await import(
  "../src/app/onboarding/step-2/page"
);

const UNIVERSAL = getAppManifest("website-builder");
if (UNIVERSAL === undefined) throw new Error("Website Builder manifest missing");
const LODGING: AppManifest = {
  ...UNIVERSAL,
  appId: "lodging-pms",
  code: "PMS",
  title: "Lodging PMS",
  targetIndustries: ["Hospitality & Lodging"],
};

let container: HTMLElement;
let root: Root;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  groups.current = { recommended: [UNIVERSAL], additional: [LODGING] };
  push.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ data: { industries: [] } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderPage(): Promise<void> {
  act(() => root.render(<OnboardingStep2Page />));
  await act(async () => {
    await Promise.resolve();
  });
}

function cards(): HTMLElement[] {
  return Array.from(container.querySelectorAll(".cursor-pointer"));
}

function form(): HTMLFormElement {
  const element = container.querySelector("form");
  if (!(element instanceof HTMLFormElement)) throw new Error("No form");
  return element;
}

async function submit(): Promise<void> {
  await act(async () => {
    form().requestSubmit();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("onboarding step 2 picker", () => {
  it("selects a card, submits and follows the redirect", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { industries: ["Hospitality & Lodging"] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ redirectUrl: "/onboarding/step-3" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await renderPage();
    expect(container.textContent).toContain("Lodging PMS");

    act(() => cards()[0]?.click());
    expect(container.textContent).toContain("1 applications selected");

    await submit();
    const post = fetchMock.mock.calls.find(
      (call) => String(call[0]).includes("/step-2") && call[1]?.method === "POST",
    );
    expect(post).toBeDefined();
    expect(push).toHaveBeenCalledWith("/onboarding/step-3");
  });

  it("requires at least one application", async () => {
    await renderPage();
    await submit();
    expect(container.textContent).toContain("Please select at least one");
  });

  it("shows the problem detail when the save fails", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { industries: ["Hospitality & Lodging"] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Selection was rejected." }), {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
      );
    await renderPage();
    act(() => cards()[0]?.click());
    await submit();
    expect(container.textContent).toContain("Selection was rejected.");
  });
});
