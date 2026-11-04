import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLATFORM_API_PATHS,
  platformFetch,
  setUnauthorizedHandler,
} from "../src/lib/api";

function stubResponse(status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status })),
  );
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
});

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe("Platform session loss", () => {
  it("notifies the shell when a data request loses the session", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    stubResponse(401);

    await platformFetch("/api/v1/admin/tenants");

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("keeps the auth endpoints out of the global redirect", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    stubResponse(401);

    await platformFetch(PLATFORM_API_PATHS.me);

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not notify on a successful response", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    stubResponse(200);

    await platformFetch("/api/v1/admin/tenants");

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not notify on a 403", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    stubResponse(403);

    await platformFetch("/api/v1/admin/tenants");

    expect(handler).not.toHaveBeenCalled();
  });

  it("stops notifying once the shell clears the handler", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    setUnauthorizedHandler(null);
    stubResponse(401);

    await platformFetch("/api/v1/admin/tenants");

    expect(handler).not.toHaveBeenCalled();
  });
});
