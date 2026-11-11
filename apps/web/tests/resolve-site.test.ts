import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveStorefrontSite } from "../src/lib/storefront/resolve-site";

const HOST = "acme.businessos.app";

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const VALID_SITE = {
  siteId: "site_1",
  orgId: "org_1",
  status: "PUBLISHED",
  title: "River View Bistro",
  homePath: "/",
  defaultLocale: "en",
};

beforeEach(() => {
  vi.stubEnv("API_URL", "http://localhost:4000");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("storefront resolve contract client", () => {
  it("asks the resolve endpoint for the normalized host and exposes public fields only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, VALID_SITE));
    vi.stubGlobal("fetch", fetchMock);

    const resolution = await resolveStorefrontSite(HOST);

    expect(resolution).toEqual({
      kind: "published",
      site: { title: "River View Bistro", homePath: "/", defaultLocale: "en", homePage: null },
    });
    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain("/api/v1/storefront/resolve");
    expect(requestedUrl).toContain("host=" + HOST);
    expect(JSON.stringify(resolution)).not.toContain("org_1");
    expect(JSON.stringify(resolution)).not.toContain("site_1");
  });

  it.each([
    [404, "unavailable"],
    [410, "gone"],
    [500, "upstream_error"],
  ])("maps HTTP %s to %s", async (status, kind) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(status, {})));

    expect(await resolveStorefrontSite(HOST)).toEqual({ kind });
  });

  it("treats a suspended status as GONE and a draft as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, { ...VALID_SITE, status: "SUSPENDED" })));
    expect(await resolveStorefrontSite(HOST)).toEqual({ kind: "gone" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, { ...VALID_SITE, status: "DRAFT" })));
    expect(await resolveStorefrontSite(HOST)).toEqual({ kind: "unavailable" });
  });

  it("fails closed on an unexpected payload or a transport failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, { title: "missing ids" })));
    expect(await resolveStorefrontSite(HOST)).toEqual({ kind: "upstream_error" });

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket closed")));
    expect(await resolveStorefrontSite(HOST)).toEqual({ kind: "upstream_error" });
  });
});
