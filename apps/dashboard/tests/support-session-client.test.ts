import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { SESSION_COOKIE_NAME } from "../src/lib/auth-constants";
import {
  endSupportSession,
  fetchActiveSupportSession,
  fetchSupportSessionHistory,
  SupportSessionClientError,
} from "../src/lib/support-session-client";

const state = vi.hoisted(
  (): { cookie: string | undefined } => ({ cookie: "session-token" })
);

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        state.cookie === undefined ? undefined : { name, value: state.cookie },
    }),
}));

const API_URL = "http://api.test";
const TICKET_ID = "7c5f9f6e-2f1a-4f4c-9d2a-5b6f8c1d3e4f";

const SESSION = {
  ticketId: TICKET_ID,
  operatorDisplayName: "Duty Operator",
  reason: "Investigating the billing discrepancy reported in SUP-237.",
  ticketRef: "SUP-237",
  startedAt: "2026-11-09T13:00:00.000Z",
  expiresAt: "2026-11-09T13:30:00.000Z",
};

const HISTORY_ITEM = {
  ...SESSION,
  endedAt: null,
  endedBy: null,
};

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type":
        status >= 400 ? "application/problem+json" : "application/json",
    },
  });
}

function envelope(data: unknown): unknown {
  return {
    success: true,
    data,
    requestId: "req_support_probe",
    timestamp: "2026-11-09T13:05:00.000Z",
  };
}

async function readClientError(
  promise: Promise<unknown>
): Promise<SupportSessionClientError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason
  );
  if (!(error instanceof SupportSessionClientError)) {
    throw new Error("Expected a SupportSessionClientError");
  }
  return error;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function firstCall(): [RequestInfo | URL, RequestInit | undefined] {
  const call = fetchMock.mock.calls[0];
  if (call === undefined) {
    throw new Error("No request was issued");
  }
  return [call[0], call[1]];
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
  const headers = init?.headers;
  if (headers === undefined) return null;
  if (headers instanceof Headers) return headers.get(name);
  if (Array.isArray(headers)) {
    const match = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
    return match === undefined ? null : match[1];
  }
  return headers[name] ?? null;
}

beforeEach(() => {
  process.env.API_URL = API_URL;
  state.cookie = "session-token";
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Tenant support-session client", () => {
  it("requires an authenticated tenant session", async () => {
    state.cookie = undefined;

    const error = await readClientError(fetchActiveSupportSession());

    expect(error.status).toBe(401);
    expect(error.code).toBe(PLATFORM_ERROR_CODE.AUTH_REQUIRED);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails loudly when the API origin is not configured", async () => {
    delete process.env.API_URL;

    await expect(fetchActiveSupportSession()).rejects.toThrow(
      "API_URL environment variable must be pre-declared in .env"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the active session with the tenant cookie", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, envelope({ active: true, session: SESSION }))
    );

    const session = await fetchActiveSupportSession();
    const [url, init] = firstCall();

    expect(session).toEqual(SESSION);
    expect(requestUrl(url)).toBe(`${API_URL}/api/v1/support-sessions/active`);
    expect(headerOf(init, "Cookie")).toBe(
      `${SESSION_COOKIE_NAME}=session-token`
    );
    expect(headerOf(init, "Accept")).toBe("application/json");
  });

  it("returns null when the workspace has no active session", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, envelope({ active: false, session: null }))
    );

    await expect(fetchActiveSupportSession()).resolves.toBeNull();
  });

  it("sends the cursor and the requested limit on the history read", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        200,
        envelope({ items: [HISTORY_ITEM], nextCursor: "next-cursor" })
      )
    );

    const page = await fetchSupportSessionHistory({ cursor: "cur/1", limit: 5 });
    const [url] = firstCall();

    expect(page.items).toEqual([HISTORY_ITEM]);
    expect(page.nextCursor).toBe("next-cursor");
    expect(requestUrl(url)).toBe(
      `${API_URL}/api/v1/support-sessions/history?cursor=cur%2F1&limit=5`
    );
  });

  it("uses the default page size when no limit is given", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, envelope({ items: [], nextCursor: null }))
    );

    await fetchSupportSessionHistory();
    const [url] = firstCall();

    expect(requestUrl(url)).toBe(
      `${API_URL}/api/v1/support-sessions/history?limit=20`
    );
  });

});

describe("Tenant support-session client error mapping", () => {
  it("surfaces the RFC 7807 detail and code", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, {
        type: "/errors/capability-denied",
        title: "Forbidden",
        status: 403,
        detail: "Capability denied.",
        code: "CAPABILITY_DENIED",
      })
    );

    const error = await readClientError(fetchActiveSupportSession());

    expect(error.status).toBe(403);
    expect(error.message).toBe("Capability denied.");
    expect(error.code).toBe("CAPABILITY_DENIED");
  });

  it("falls back to the problem title when the detail is absent", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { title: "Forbidden", status: 403 })
    );

    const error = await readClientError(fetchActiveSupportSession());

    expect(error.message).toBe("Forbidden");
    expect(error.code).toBeNull();
  });

  it("falls back to the status line for a non-JSON error body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>bad gateway</html>", { status: 502 })
    );

    const error = await readClientError(fetchActiveSupportSession());

    expect(error.message).toBe("Support-session request failed (502).");
    expect(error.code).toBeNull();
  });

  it("rejects a success payload that breaks the contract", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, envelope({ active: true })));

    const error = await readClientError(fetchActiveSupportSession());

    expect(error.status).toBe(502);
    expect(error.message).toBe(
      "The API returned an invalid active support-session payload."
    );
  });

  it("rejects an invalid history payload", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, envelope({ items: [{ ticketId: "nope" }] }))
    );

    const error = await readClientError(fetchSupportSessionHistory());

    expect(error.status).toBe(502);
    expect(error.message).toBe(
      "The API returned an invalid support-session history payload."
    );
  });

  it("rethrows a transport failure that is not a JSON parse error", async () => {
    const broken = Object.assign(new Response("{}", { status: 200 }), {
      json: () => Promise.reject(new TypeError("socket hang up")),
    });
    fetchMock.mockResolvedValueOnce(broken);

    await expect(fetchActiveSupportSession()).rejects.toThrow("socket hang up");
  });

});

describe("Tenant support-session termination", () => {
  it("ends the session with a DELETE scoped to the tenant cookie", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        200,
        envelope({
          endedAt: "2026-11-09T13:20:00.000Z",
          endedBy: "tenant:usr_workspace_admin",
        })
      )
    );

    const result = await endSupportSession(TICKET_ID);
    const [url, init] = firstCall();

    expect(requestUrl(url)).toBe(
      `${API_URL}/api/v1/support-sessions/${TICKET_ID}`
    );
    expect(init?.method).toBe("DELETE");
    expect(headerOf(init, "Cookie")).toBe(
      `${SESSION_COOKIE_NAME}=session-token`
    );
    expect(result.endedBy).toBe("tenant:usr_workspace_admin");
  });

  it("surfaces the RFC 7807 detail when the tenant cannot end the session", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, {
        type: "/errors/capability-denied",
        title: "Forbidden",
        status: 403,
        detail:
          "Ending a support session requires the organization update permission.",
        code: "CAPABILITY_DENIED",
      })
    );

    const error = await readClientError(endSupportSession(TICKET_ID));

    expect(error.status).toBe(403);
    expect(error.code).toBe("CAPABILITY_DENIED");
    expect(error.message).toContain("organization update permission");
  });
});
