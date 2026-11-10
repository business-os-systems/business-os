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
const JSON_HEADERS = { "content-type": "application/json" };
const NEXT_STEP = "/onboarding/step-3";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/onboarding-apps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/onboarding-apps")>();
  return { ...actual, groupOnboardingApps: () => groups.current };
});

const {
  default: OnboardingStep2Page,
  readIndustries,
  readProblemDetail,
  readRedirectUrl,
} = await import("../src/app/onboarding/step-2/page");

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
      headers: JSON_HEADERS,
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

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
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
        headers: JSON_HEADERS,
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ redirectUrl: NEXT_STEP }), {
        status: 200,
        headers: JSON_HEADERS,
      }),
    );

    await renderPage();
    expect(container.textContent).toContain("Lodging PMS");

    act(() => cards()[0]?.click());
    expect(container.textContent).toContain("1 applications selected");

    await submit();
    const post = fetchMock.mock.calls.find(
      ([input, init]) =>
        requestUrl(input).includes("/step-2") && init?.method === "POST",
    );
    expect(post).toBeDefined();
    expect(push).toHaveBeenCalledWith(NEXT_STEP);
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
          headers: JSON_HEADERS,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Selection was rejected." }), {
          status: 422,
          headers: JSON_HEADERS,
        }),
      );
    await renderPage();
    act(() => cards()[0]?.click());
    await submit();
    expect(container.textContent).toContain("Selection was rejected.");
  });
});

describe("onboarding step 2 payload readers", () => {
  it("rejects malformed industries payloads and keeps only strings", () => {
    expect(readIndustries(null)).toEqual([]);
    expect(readIndustries({ data: null })).toEqual([]);
    expect(readIndustries({ data: { industries: "Hospitality" } })).toEqual([]);
    expect(readIndustries({ data: { industries: ["A", 1] } })).toEqual(["A"]);
  });

  it("reads a problem detail only when it is a string", () => {
    expect(readProblemDetail(null)).toBeNull();
    expect(readProblemDetail({ detail: 42 })).toBeNull();
    expect(readProblemDetail({ detail: "Rejected." })).toBe("Rejected.");
  });

  it("falls back to the next step for a malformed redirect", () => {
    expect(readRedirectUrl(null)).toBe(NEXT_STEP);
    expect(readRedirectUrl({ redirectUrl: 42 })).toBe(NEXT_STEP);
    expect(readRedirectUrl({ redirectUrl: "/next" })).toBe("/next");
  });
});

describe("onboarding step 2 failure paths", () => {
  it("logs a failed industries request without crashing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));
    await renderPage();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logs a rejected industries request without crashing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await renderPage();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("shows a network error when the save rejects", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { industries: [] } }), {
          status: 200,
          headers: JSON_HEADERS,
        }),
      )
      .mockRejectedValueOnce(new Error("offline"));
    await renderPage();
    act(() => cards()[0]?.click());
    await submit();
    expect(container.textContent).toContain("network error");
  });

  it("selects an additional app and uses the default redirect", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { industries: [] } }), {
          status: 200,
          headers: JSON_HEADERS,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: JSON_HEADERS,
        }),
      );
    await renderPage();
    act(() => cards()[1]?.click());
    expect(container.textContent).toContain("1 applications selected");
    await submit();
    expect(push).toHaveBeenCalledWith(NEXT_STEP);
  });
});
