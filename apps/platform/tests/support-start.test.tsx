// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import TenantSupportPage from "../src/app/(platform)/tenants/[orgId]/support/page";
import { useActiveSupportSessions } from "../src/lib/use-active-support-sessions";

const authState = vi.hoisted(() => ({ capabilities: [] as string[] }));

vi.mock("../src/components/auth/auth-provider", () => ({
  usePlatformAuth: () => ({
    session: {
      operator: { id: "op_1", email: "ops@example.com", displayName: "Ops" },
      capabilities: authState.capabilities,
    },
    loading: false,
    error: null,
    signOutFailed: false,
    refresh: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    forceSignOut: () => undefined,
  }),
}));

vi.mock(
  "../src/app/(platform)/tenants/[orgId]/tenant-record-context",
  () => ({
    useTenantRecord: () => ({
      record: { profile: { id: "org_1" } },
      reload: vi.fn(),
    }),
  }),
);

const REASON = "Investigating the billing discrepancy.";
const START_LABEL = "Start support session";
const TICKET_REF = "SUP-237";
const REASON_FIELD = "-reason";
const TICKET_FIELD = "-ticketRef";
const TICKET_ID = "7c5f9f6e-2f1a-4f4c-9d2a-5b6f8c1d3e4f";
const OTHER_TICKET_ID = "1f5d3a2c-9b8e-4c7d-8a6f-2e1d0c9b8a7f";
const STARTED_TOKEN = "header.payload.signature";

const SESSION = {
  ticketId: TICKET_ID,
  organizationId: "org_1",
  reason: REASON,
  ticketRef: TICKET_REF,
  startedAt: "2026-11-09T13:00:00.000Z",
  expiresAt: "2026-11-09T13:30:00.000Z",
};

const OTHER_SESSION = {
  ...SESSION,
  ticketId: OTHER_TICKET_ID,
  organizationId: "org_2",
  reason: "Another workspace's session.",
  ticketRef: "SUP-999",
};

const STARTED = {
  ticketId: TICKET_ID,
  expiresAt: "2026-11-09T13:30:00.000Z",
  tenantBannerToken: STARTED_TOKEN,
};

const ALREADY_ACTIVE = {
  type: "/errors/impersonation-already-active",
  title: "Resource Conflict",
  status: 409,
  detail: "A support session is already active for this operator.",
  code: "IMPERSONATION_ALREADY_ACTIVE",
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const roots: Root[] = [];
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let activeResponses: unknown[] = [];

const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type":
        status >= 400 ? "application/problem+json" : "application/json",
    },
  });

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function render(ui: React.ReactElement): void {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(ui));
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setField(idSuffix: string, next: string): void {
  const element = document.querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >(`[id$="${idSuffix}"]`);
  if (element === null) {
    throw new Error(`No field ending in ${idSuffix}`);
  }
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
      element,
      next,
    );
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function clickButton(label: string): void {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent.trim() === label,
  );
  if (button === undefined) {
    throw new Error(`No button labelled ${label}`);
  }
  act(() => button.click());
}

function submitForm(): void {
  const form = document.querySelector("form");
  if (form === null) {
    throw new Error("No form to submit");
  }
  act(() => form.requestSubmit());
}

function requestCount(method: string): number {
  return fetchMock.mock.calls.filter(
    ([, init]) => (init?.method ?? "GET").toUpperCase() === method,
  ).length;
}

interface FetchOverrides {
  readonly post?: () => Response;
  readonly active?: () => Response;
  readonly remove?: () => Response;
}

function activeReply(overrides?: FetchOverrides): Response {
  return (
    overrides?.active?.() ??
    reply(200, { data: { items: activeResponses.shift() ?? [] } })
  );
}

function postReply(overrides?: FetchOverrides): Response {
  return overrides?.post?.() ?? reply(201, { data: STARTED });
}

function deleteReply(overrides?: FetchOverrides): Response {
  return (
    overrides?.remove?.() ??
    reply(200, {
      data: { endedAt: "2026-11-09T13:20:00.000Z", endedBy: "operator" },
    })
  );
}

function useFetchRoutes(overrides?: FetchOverrides): void {
  fetchMock.mockImplementation((input, init) => {
    const url = requestUrl(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" && url.endsWith("/impersonation/active")) {
      return Promise.resolve(activeReply(overrides));
    }
    if (method === "POST") {
      return Promise.resolve(postReply(overrides));
    }
    if (method === "DELETE") {
      return Promise.resolve(deleteReply(overrides));
    }
    return Promise.resolve(reply(404, {}));
  });
}

function requestBody(init: RequestInit | undefined): string {
  if (typeof init?.body !== "string") {
    throw new Error("Expected a JSON request body");
  }
  return init.body;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  authState.capabilities = [PLATFORM_CAPABILITIES.IMPERSONATE.code];
  activeResponses = [[SESSION, OTHER_SESSION]];
  fetchMock = vi.fn<typeof fetch>();
  useFetchRoutes();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function mockClipboard(writeText: () => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

describe("Tenant support-session start surface", () => {
  it("denies a direct visit without platform:impersonate and issues no request", () => {
    authState.capabilities = [];
    expect(renderToString(<TenantSupportPage />)).toContain("Capability denied");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders the loading state before the active read arrives", () => {
    expect(renderToString(<TenantSupportPage />)).toContain(
      "Loading support sessions",
    );
  });

  it("shows only the current workspace's active session", async () => {
    render(<TenantSupportPage />);
    await settle();

    expect(document.body.textContent).toContain(
      REASON,
    );
    expect(document.body.textContent).not.toContain(
      "Another workspace's session.",
    );
  });

  it("renders the empty state when this workspace has no active session", async () => {
    activeResponses = [[]];
    render(<TenantSupportPage />);
    await settle();

    expect(document.body.textContent).toContain("No active support session");
  });

  it("renders the read failure instead of a fabricated session", async () => {
    useFetchRoutes({ active: () => reply(500, {}) });
    render(<TenantSupportPage />);
    await settle();

    expect(document.body.textContent).toContain(
      "Could not load support sessions",
    );
  });

});

describe("Tenant support-session termination", () => {
  it("shows the real detail when the session cannot be ended", async () => {
    activeResponses = [[SESSION]];
    useFetchRoutes({
      remove: () =>
        reply(409, {
          type: "/errors/support-session-already-ended",
          title: "Resource Conflict",
          status: 409,
          detail: "This support session has already ended.",
          code: "SUPPORT_SESSION_ALREADY_ENDED",
        }),
    });
    render(<TenantSupportPage />);
    await settle();

    clickButton("End session");
    await settle();

    expect(document.body.textContent).toContain(
      "This support session has already ended.",
    );
    expect(document.body.textContent).toContain(REASON);
  });

  it("ends the session and refreshes the panel", async () => {
    activeResponses = [[SESSION], []];
    render(<TenantSupportPage />);
    await settle();

    clickButton("End session");
    await settle();

    expect(requestCount("DELETE")).toBe(1);
    expect(document.body.textContent).toContain("No active support session");
  });
});

describe("Tenant support-session start modal", () => {
  it("rejects a short reason before sending the request", async () => {
    render(<TenantSupportPage />);
    await settle();
    clickButton(START_LABEL);
    setField(REASON_FIELD, "bad");
    setField(TICKET_FIELD, TICKET_REF);
    submitForm();
    await settle();

    expect(document.body.textContent).toContain(
      "Give a reason of at least 5 characters.",
    );
    expect(requestCount("POST")).toBe(0);
  });

});

describe("Tenant support-session start", () => {
  it("starts the session, shows the signed ticket once and reloads", async () => {
    activeResponses = [[], [SESSION]];
    render(<TenantSupportPage />);
    await settle();

    clickButton(START_LABEL);
    setField(REASON_FIELD, REASON);
    setField(TICKET_FIELD, TICKET_REF);
    submitForm();
    await settle();

    const post = fetchMock.mock.calls.find(
      ([, init]) => (init?.method ?? "GET").toUpperCase() === "POST",
    );
    expect(JSON.parse(requestBody(post?.[1]))).toEqual({
      organizationId: "org_1",
      reason: REASON,
      ticketRef: TICKET_REF,
    });
    expect(document.body.textContent).toContain(STARTED_TOKEN);
    expect(document.body.textContent).toContain(
      REASON,
    );
    expect(requestCount("GET")).toBeGreaterThanOrEqual(2);
  });

});

describe("Tenant support-session ticket copy", () => {
  it("copies the signed ticket and confirms it", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    mockClipboard(writeText);
    activeResponses = [[], [SESSION]];
    render(<TenantSupportPage />);
    await settle();

    clickButton(START_LABEL);
    setField(REASON_FIELD, REASON);
    setField(TICKET_FIELD, TICKET_REF);
    submitForm();
    await settle();

    clickButton("Copy ticket");
    await settle();

    expect(writeText).toHaveBeenCalledWith(STARTED_TOKEN);
    expect(document.body.textContent).toContain("Copied");
  });

  it("shows the clipboard failure instead of claiming a copy", async () => {
    mockClipboard(() => Promise.reject(new Error("Clipboard is blocked.")));
    activeResponses = [[], [SESSION]];
    render(<TenantSupportPage />);
    await settle();

    clickButton(START_LABEL);
    setField(REASON_FIELD, REASON);
    setField(TICKET_FIELD, TICKET_REF);
    submitForm();
    await settle();

    clickButton("Copy ticket");
    await settle();

    expect(document.body.textContent).toContain("Clipboard is blocked.");
  });

});

describe("Tenant support-session modal dismissal", () => {
  it("closes the start modal with Escape without sending a request", async () => {
    render(<TenantSupportPage />);
    await settle();
    clickButton(START_LABEL);
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await settle();

    expect(document.body.textContent).not.toContain("Support ticket");
    expect(requestCount("POST")).toBe(0);
  });
});

describe("Tenant support-session hook guard", () => {
  it("ignores a removal before the active read resolves", () => {
    function Probe() {
      const { remove } = useActiveSupportSessions({ enabled: false });
      return (
        <button type="button" onClick={() => remove("ticket-1")}>
          remove
        </button>
      );
    }
    render(<Probe />);
    clickButton("remove");
  });
});

describe("Tenant support-session start conflict", () => {
  it("includes the optional target user when provided", async () => {
    activeResponses = [[], [SESSION]];
    render(<TenantSupportPage />);
    await settle();

    clickButton(START_LABEL);
    setField(REASON_FIELD, REASON);
    setField(TICKET_FIELD, TICKET_REF);
    setField("-targetUserId", "usr_42");
    submitForm();
    await settle();

    const post = fetchMock.mock.calls.find(
      ([, init]) => (init?.method ?? "GET").toUpperCase() === "POST",
    );
    expect(JSON.parse(requestBody(post?.[1]))).toEqual({
      organizationId: "org_1",
      reason: REASON,
      ticketRef: TICKET_REF,
      targetUserId: "usr_42",
    });
  });

  it("shows the real conflict detail when a session is already active", async () => {
    useFetchRoutes({ post: () => reply(409, ALREADY_ACTIVE) });
    render(<TenantSupportPage />);
    await settle();

    clickButton(START_LABEL);
    setField(REASON_FIELD, REASON);
    setField(TICKET_FIELD, TICKET_REF);
    submitForm();
    await settle();

    expect(document.body.textContent).toContain(ALREADY_ACTIVE.detail);
  });
});
