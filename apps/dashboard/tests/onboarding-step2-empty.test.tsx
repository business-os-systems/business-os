// @vitest-environment jsdom
/* global HTMLElement */
import { afterEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("../src/lib/onboarding-apps", () => ({
  listOnboardingApps: () => [],
  groupOnboardingApps: () => ({ recommended: [], additional: [] }),
}));

const { default: OnboardingStep2Page } = await import(
  "../src/app/onboarding/step-2/page"
);

let container: HTMLElement | null = null;

afterEach(() => {
  if (container !== null) {
    act(() => {
      const root = createRoot(container as HTMLElement);
      root.unmount();
    });
    container.remove();
    container = null;
  }
  vi.unstubAllGlobals();
});

describe("onboarding step 2 empty registry", () => {
  it("renders the genuine empty state when no app is registered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ data: { industries: [] } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<OnboardingStep2Page />);
      await Promise.resolve();
    });
    expect(container.textContent).toContain(
      "No applications are registered for this workspace yet.",
    );
  });
});
