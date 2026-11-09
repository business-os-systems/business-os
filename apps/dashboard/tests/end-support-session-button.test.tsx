// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const state = vi.hoisted<{
  result: { ok: boolean; detail: string };
  calls: string[];
}>(() => ({
  result: { ok: true, detail: "" },
  calls: [],
}));
const refresh = vi.hoisted(() => vi.fn());

vi.mock(
  "../src/app/(dashboard)/settings/security/end-support-session-action",
  () => ({
    endSupportSessionAction: vi.fn((ticketId: string) => {
      state.calls.push(ticketId);
      return Promise.resolve(state.result);
    }),
  }),
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { EndSupportSessionButton } from "../src/app/(dashboard)/settings/security/end-support-session-button";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const roots: Root[] = [];

function render(): void {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() =>
    root.render(<EndSupportSessionButton ticketId="ticket-1" />),
  );
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function clickEnd(): void {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent.trim() === "End session",
  );
  if (button === undefined) {
    throw new Error("No End session button");
  }
  act(() => button.click());
}

beforeEach(() => {
  state.result = { ok: true, detail: "" };
  state.calls = [];
  refresh.mockClear();
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("Tenant terminate control", () => {
  it("ends the session and refreshes the history on success", async () => {
    render();
    clickEnd();
    await settle();

    expect(state.calls).toEqual(["ticket-1"]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the real detail and does not refresh on failure", async () => {
    state.result = {
      ok: false,
      detail: "Ending a support session requires the organization update permission.",
    };
    render();
    clickEnd();
    await settle();

    expect(document.body.textContent).toContain(
      "Ending a support session requires the organization update permission.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
