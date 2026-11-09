import { afterEach, describe, expect, it, vi } from "vitest";
import { requestTenantSwitch } from "../src/lib/tenant-switch";

function stubFetch(response: Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(response)
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestTenantSwitch", () => {
  it("returns the redirect URL from a successful switch", async () => {
    stubFetch(
      new Response(JSON.stringify({ redirectUrl: "/dashboard" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const outcome = await requestTenantSwitch("org_beta");
    expect(outcome).toEqual({
      ok: true,
      redirectUrl: "/dashboard",
      errorMessage: null,
    });
  });

  it("surfaces the RFC 7807 detail when the switch is refused", async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          type: "/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: "You are not a member of this workspace.",
          code: "FORBIDDEN",
        }),
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      )
    );

    const outcome = await requestTenantSwitch("org_unauthorized");
    expect(outcome.ok).toBe(false);
    expect(outcome.errorMessage).toBe(
      "You are not a member of this workspace."
    );
  });

  it("rejects a success response without an internal redirect URL", async () => {
    stubFetch(new Response(JSON.stringify({}), { status: 200 }));

    const outcome = await requestTenantSwitch("org_beta");
    expect(outcome.ok).toBe(false);
    expect(outcome.errorMessage).toContain("response was invalid");
  });

  it("refuses an external redirect target", async () => {
    stubFetch(
      new Response(JSON.stringify({ redirectUrl: "https://evil.example.com" }), {
        status: 200,
      })
    );

    const outcome = await requestTenantSwitch("org_beta");
    expect(outcome.ok).toBe(false);
  });

  it("propagates a transport failure to the caller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("connection reset"))
    );

    await expect(requestTenantSwitch("org_beta")).rejects.toThrow(
      "connection reset"
    );
  });
});
