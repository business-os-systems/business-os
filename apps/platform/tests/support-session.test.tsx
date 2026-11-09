// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SupportSessionMarker } from "../src/components/layout/support-session-marker";
import type { PlatformSupportSession } from "../src/lib/support-session-api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SESSION: PlatformSupportSession = {
  ticketId: "7c5f9f6e-2f1a-4f4c-9d2a-5b6f8c1d3e4f",
  organizationId: "org_support_probe",
  reason: "Investigating the billing discrepancy reported in SUP-237.",
  ticketRef: "SUP-237",
  startedAt: "2026-11-09T13:00:00.000Z",
  expiresAt: "2026-11-09T13:30:00.000Z",
};

const MARKER_LABEL = "Read-only support session";
const ENDED_AT = "2026-11-09T13:12:00.000Z";
const MAXIMUM_WAIT_ATTEMPTS = 20;

const roots: Root[] = [];
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type":
        status >= 400 ? "application/problem+json" : "application/json",
    },
  });
}

function activeReply(items: readonly PlatformSupportSession[]): Response {
  return reply(200, {
    success: true,
    data: { items },
    requestId: "req_support_probe",
    timestamp: "2026-11-09T13:05:00.000Z",
  });
}

function endReply(): Response {
  return reply(200, {
    success: true,
    data: { endedAt: ENDED_AT, endedBy: "op_support_probe" },
    requestId: "req_support_probe",
    timestamp: ENDED_AT,
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function renderMarker(): void {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<SupportSessionMarker />));
}

async function waitFor(predicate: () => boolean, attempt = 1): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
  if (predicate()) {
    return;
  }
  if (attempt >= MAXIMUM_WAIT_ATTEMPTS) {
    throw new Error("The marker did not reach the expected state");
  }
  return waitFor(predicate, attempt + 1);
}

function exitButton(): HTMLButtonElement {
  const button = document.querySelector("button");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("The marker has no Exit button");
  }
  return button;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("Platform support-session marker (FR-096)", () => {
  it("renders nothing when the operator has no active session", async () => {
    fetchMock.mockResolvedValueOnce(activeReply([]));

    renderMarker();
    await waitFor(() => !document.body.textContent.includes("Checking"));

    expect(document.body.textContent).not.toContain(MARKER_LABEL);
  });

  it("shows the operator mode and the session expiry", async () => {
    fetchMock.mockResolvedValueOnce(activeReply([SESSION]));

    renderMarker();
    await waitFor(() => document.body.textContent.includes(MARKER_LABEL));

    expect(document.body.textContent).toContain("Platform operator");
    expect(document.body.textContent).toContain("SUP-237");
    expect(document.body.textContent).toContain("09 Nov 2026, 13:30 UTC");
    expect(document.body.textContent).toContain("Exit");
  });

});

describe("Platform support-session marker exit (FR-096)", () => {
  it("ends the session through DELETE when the operator exits", async () => {
    fetchMock
      .mockResolvedValueOnce(activeReply([SESSION]))
      .mockResolvedValueOnce(endReply());

    renderMarker();
    await waitFor(() => document.body.textContent.includes("Exit"));

    await act(async () => {
      exitButton().click();
      await Promise.resolve();
    });
    await waitFor(() => !document.body.textContent.includes(MARKER_LABEL));

    const call = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "DELETE"
    );
    if (call === undefined) {
      throw new Error("Exit did not issue a DELETE request");
    }
    expect(requestUrl(call[0])).toBe(
      `http://api.test/api/v1/admin/impersonation/${SESSION.ticketId}`
    );
  });

});

describe("Platform support-session marker failures (FR-096)", () => {
  it("warns, without inventing a session, when the active-session read fails", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(403, {
        type: "/errors/capability-denied",
        title: "Forbidden",
        status: 403,
        detail: "Capability denied.",
        code: "CAPABILITY_DENIED",
      })
    );

    renderMarker();
    await waitFor(() =>
      document.body.textContent.includes("Support-session marker unavailable")
    );

    expect(document.body.textContent).toContain("Capability denied.");
    expect(document.body.textContent).not.toContain(MARKER_LABEL);
    expect(document.querySelector("button")).toBeNull();
  });

  it("shows the RFC 7807 detail when ending the session fails", async () => {
    const detail = "This support session has already ended.";
    fetchMock.mockResolvedValueOnce(activeReply([SESSION])).mockResolvedValueOnce(
      reply(409, {
        type: "/errors/support-session-already-ended",
        title: "Support Session Already Ended",
        status: 409,
        detail,
        code: "SUPPORT_SESSION_ALREADY_ENDED",
      })
    );

    renderMarker();
    await waitFor(() => document.body.textContent.includes("Exit"));

    await act(async () => {
      exitButton().click();
      await Promise.resolve();
    });
    await waitFor(() => document.body.textContent.includes(detail));

    expect(document.body.textContent).toContain("Could not end the support session");
    expect(document.body.textContent).toContain(MARKER_LABEL);
  });
});
