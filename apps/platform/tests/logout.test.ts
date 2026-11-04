import { afterEach, describe, expect, it, vi } from "vitest";
import { requestPlatformSignOut } from "../src/lib/logout.js";

process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("platform sign-out", () => {
  it("reports success when the API revokes the session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 }))
    );

    await expect(requestPlatformSignOut()).resolves.toEqual({ ok: true });
  });

  it("surfaces the server problem detail when logout fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ detail: "Control session is invalid" }),
            {
              status: 401,
              headers: { "Content-Type": "application/problem+json" },
            }
          )
      )
    );

    const outcome = await requestPlatformSignOut();

    expect(outcome).toEqual({
      ok: false,
      message: "Control session is invalid",
    });
  });

  it("never claims success when the network fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("socket hang up");
      })
    );

    const outcome = await requestPlatformSignOut();

    expect(outcome.ok).toBe(false);
  });
});
