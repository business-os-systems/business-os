import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE_TOKENS } from "@suite/website-builder/appearance";
import { loadStorefrontPage } from "../src/lib/storefront/page-client";

const HOST = "acme.businessos.app";

const HOME_AST = {
  version: 1,
  schemaVersion: "2026-03",
  sections: [
    {
      id: "section_home",
      blocks: [{ id: "hero_home", type: "hero", props: { headline: "River View Bistro" } }],
    },
  ],
} as const;

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubEnv("API_URL", "http://localhost:4000");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("tenant host root delivery states (FR-035, FR-039, FR-043)", () => {
  it("loads the published home page for the request's host", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      respond(200, {
        title: "River View Bistro",
        path: "/",
        ast: HOME_AST,
        media: {},
        tokens: DEFAULT_APPEARANCE_TOKENS,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadStorefrontPage({ host: HOST, path: "/" });

    expect(result.kind).toBe("published");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("path=%2F");
  });

  it("renders a neutral holding state when nothing is published", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(404, {})));

    expect(await loadStorefrontPage({ host: HOST, path: "/" })).toEqual({
      kind: "not_found",
    });
  });

  it("returns GONE when the site is suspended or archived", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(410, {})));

    expect(await loadStorefrontPage({ host: HOST, path: "/" })).toEqual({ kind: "gone" });
  });

  it("degrades to a neutral error when the API cannot answer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket closed")));

    expect(await loadStorefrontPage({ host: HOST, path: "/" })).toEqual({
      kind: "upstream_error",
    });
  });
});
