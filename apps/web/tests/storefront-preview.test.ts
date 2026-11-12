import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE_TOKENS } from "@suite/website-builder/appearance";
import type { StorefrontPage } from "../src/lib/storefront/contract";
import { metadataForPage } from "../src/lib/storefront/metadata";
import { loadStorefrontPreviewPage } from "../src/lib/storefront/page-client";
import { readPreviewToken } from "../src/lib/storefront/preview";

const PREVIEW_AST: StorefrontPage["ast"] = {
  version: 1,
  schemaVersion: "2026-03",
  meta: { title: "Draft home" },
  sections: [
    {
      id: "section_home",
      blocks: [{ id: "hero_home", type: "hero", props: { headline: "Draft headline" } }],
    },
  ],
};

const PAGE: StorefrontPage = {
  title: "Draft home",
  path: "/",
  ast: PREVIEW_AST,
  media: {},
  tokens: DEFAULT_APPEARANCE_TOKENS,
};

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrlOf(input: RequestInfo | URL | undefined): string {
  if (input === undefined) return "";
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

beforeEach(() => {
  vi.stubEnv("API_URL", "http://localhost:4000");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("signed storefront preview read (FR-037)", () => {
  it("sends the token in a header and carries no session cookie", async () => {
    type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];
    const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>(() =>
      Promise.resolve(
        respond(200, {
          title: PAGE.title,
          path: PAGE.path,
          ast: PAGE.ast,
          media: {},
          tokens: PAGE.tokens,
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadStorefrontPreviewPage({
      host: "acme.businessos.app",
      path: "/",
      token: "signed.token",
    });

    expect(result).toEqual({ kind: "published", page: PAGE });
    const call = fetchMock.mock.calls[0];
    expect(requestUrlOf(call?.[0])).toContain("/api/v1/storefront/preview");
    const headers = new Headers(call?.[1]?.headers);
    expect(headers.get("x-preview-token")).toBe("signed.token");
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
    expect(call?.[1]?.cache).toBe("no-store");
  });

  it("maps an expired or tampered token to the neutral not-found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(404, {})));
    expect(
      await loadStorefrontPreviewPage({ host: "acme.businessos.app", path: "/", token: "bad" })
    ).toEqual({ kind: "not_found" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(410, {})));
    expect(
      await loadStorefrontPreviewPage({ host: "acme.businessos.app", path: "/", token: "gone" })
    ).toEqual({ kind: "gone" });
  });
});

describe("preview metadata and token parsing", () => {
  it("never index-renders a preview even when the content is published", () => {
    const metadata = metadataForPage({ kind: "published", page: PAGE }, true);

    expect(metadata.title).toBe("Draft home");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("accepts one bounded token and ignores a repeated or oversized value", async () => {
    expect(await readPreviewToken(Promise.resolve({ preview: " token " }))).toBe("token");
    expect(await readPreviewToken(Promise.resolve({ preview: ["a", "b"] }))).toBeNull();
    expect(await readPreviewToken(Promise.resolve({}))).toBeNull();
    expect(
      await readPreviewToken(Promise.resolve({ preview: "x".repeat(4097) }))
    ).toBeNull();
  });
});
