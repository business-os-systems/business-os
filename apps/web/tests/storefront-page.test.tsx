import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_APPEARANCE_TOKENS } from "@suite/website-builder/appearance";
import { StorefrontPageView } from "../src/components/storefront/page-view";
import type { StorefrontPage } from "../src/lib/storefront/contract";
import { metadataForPage } from "../src/lib/storefront/metadata";
import { loadStorefrontPage } from "../src/lib/storefront/page-client";

const HOST = "acme.businessos.app";

const PUBLISHED_AST: StorefrontPage["ast"] = {
  version: 1,
  schemaVersion: "2026-03",
  meta: { title: "Acme home", description: "Acme description" },
  sections: [
    {
      id: "section_home",
      blocks: [
        {
          id: "hero_home",
          type: "hero",
          props: {
            headline: "Published headline",
            subheadline: "Published subheadline",
            primaryCta: { label: "Book", target: { url: "/book" } },
          },
        },
      ],
    },
  ],
};

const DRAFT_AST: StorefrontPage["ast"] = {
  ...PUBLISHED_AST,
  sections: [
    {
      id: "section_home",
      blocks: [
        { id: "hero_home", type: "hero", props: { headline: "Draft headline" } },
      ],
    },
  ],
};

const STOREFRONT_PAGE: StorefrontPage = {
  title: "Acme home",
  path: "/",
  ast: PUBLISHED_AST,
  media: {},
  tokens: { ...DEFAULT_APPEARANCE_TOKENS, colorPrimary: "#123456" },
};

const PUBLISHED_PAYLOAD = {
  title: STOREFRONT_PAGE.title,
  path: STOREFRONT_PAGE.path,
  ast: PUBLISHED_AST,
  media: {},
  tokens: STOREFRONT_PAGE.tokens,
};

function requestUrlOf(input: RequestInfo | URL | undefined): string {
  if (input === undefined) {
    return "";
  }
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

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

describe("published storefront page read (T074, FR-036)", () => {
  it("loads a published page anonymously with no session or cookie material", async () => {
    type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];
    const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>(() =>
      Promise.resolve(respond(200, PUBLISHED_PAYLOAD))
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadStorefrontPage({ host: HOST, path: "/" });

    expect(result).toEqual({ kind: "published", page: STOREFRONT_PAGE });
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const requestedUrl = requestUrlOf(firstCall?.[0]);
    const requestInit = firstCall?.[1];
    expect(requestedUrl).toContain("/api/v1/storefront/page");
    expect(requestedUrl).toContain("host=" + HOST);
    expect(requestedUrl).toContain("path=%2F");
    const headers = new Headers(requestInit?.headers);
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
    expect(requestInit?.cache).toBe("no-store");
  });

  it("treats an unpublished or missing page as not found and a suspended site as gone", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(404, {})));
    expect(await loadStorefrontPage({ host: HOST, path: "/draft" })).toEqual({
      kind: "not_found",
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(410, {})));
    expect(await loadStorefrontPage({ host: HOST, path: "/" })).toEqual({ kind: "gone" });
  });

  it("fails closed on a response that leaks draft or malformed fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        respond(200, {
          title: STOREFRONT_PAGE.title,
          path: STOREFRONT_PAGE.path,
          draftAst: DRAFT_AST,
          orgId: "org_1",
        })
      )
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await loadStorefrontPage({ host: HOST, path: "/" })).toEqual({
      kind: "upstream_error",
    });
  });

  it("fails closed when the API is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket closed")));

    expect(await loadStorefrontPage({ host: HOST, path: "/" })).toEqual({
      kind: "upstream_error",
    });
  });
});

describe("storefront document rendering (T074)", () => {
  it("renders the production AST renderer with the site's published appearance tokens", () => {
    const html = renderToStaticMarkup(<StorefrontPageView page={STOREFRONT_PAGE} />);

    expect(html).toContain("Published headline");
    expect(html).toContain("Published subheadline");
    expect(html).toContain('data-cms-page="true"');
    expect(html).toContain('data-cms-theme="true"');
    expect(html).toContain("--cms-color-primary:#123456");
    expect(html).toContain("--cms-font-body:Inter, system-ui, sans-serif");
  });

  it("renders no editor chrome, workspace link or tenant identifier", () => {
    const html = renderToStaticMarkup(<StorefrontPageView page={STOREFRONT_PAGE} />);

    expect(html).not.toContain("data-editor");
    expect(html).not.toContain("Add section");
    expect(html).not.toContain("dashboard");
    expect(html).not.toContain("org_");
    expect(html).not.toContain("site_");
    expect(html).not.toContain("Draft headline");
  });

  it("never index-renders a holding, gone or failed delivery", () => {
    expect(metadataForPage({ kind: "not_found" }).robots).toEqual({
      index: false,
      follow: false,
    });
    expect(metadataForPage({ kind: "gone" }).robots).toEqual({
      index: false,
      follow: false,
    });
    expect(metadataForPage({ kind: "upstream_error" }).robots).toEqual({
      index: false,
      follow: false,
    });
  });

  it("metadata comes from the published page only", () => {
    const metadata = metadataForPage({ kind: "published", page: STOREFRONT_PAGE });

    expect(metadata.title).toBe("Acme home");
    expect(metadata.description).toBe("Acme description");
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });
});
