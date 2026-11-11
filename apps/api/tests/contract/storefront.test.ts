import { describe, expect, it } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import { DEFAULT_APPEARANCE_TOKENS } from "@suite/website-builder/appearance";
import { createStorefrontRouter } from "../../src/routes/storefront/read.js";
import { requestIdMiddleware } from "../../src/middleware/request-id.js";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";
import {
  STOREFRONT_ERROR_CODE,
  STOREFRONT_SITE_STATUS,
  storefrontPageResponseSchema,
  storefrontResolveResponseSchema,
  type StorefrontPageMetadata,
  type StorefrontReadService,
} from "../../src/services/storefront/contract.js";

const PUBLISHED_HOST = "acme.businessos.app";
const GONE_HOST = "closed.businessos.app";
const UNKNOWN_HOST = "unknown.businessos.app";
const RESOLVE_PATH = "/api/v1/storefront/resolve";
const PAGE_PATH = "/api/v1/storefront/page";
const NOT_FOUND = STOREFRONT_ERROR_CODE.NOT_FOUND;

const PAGE_AST: StorefrontPageMetadata["ast"] = {
  version: 1,
  schemaVersion: "2026-03",
  meta: { title: "Home" },
  sections: [
    {
      id: "sec_home",
      blocks: [
        {
          id: "hero_home",
          type: "hero",
          props: { headline: "Published headline" },
        },
      ],
    },
  ],
};

const PUBLISHED_SITE = {
  title: "Acme Bistro",
  homePath: "/",
  defaultLocale: "en",
  tokens: DEFAULT_APPEARANCE_TOKENS,
};

function fakeService(): StorefrontReadService {
  return {
    resolveHost(host) {
      if (host === PUBLISHED_HOST) {
        return Promise.resolve({ kind: "published", site: PUBLISHED_SITE });
      }
      if (host === GONE_HOST) {
        return Promise.resolve({ kind: "gone" });
      }
      return Promise.resolve({ kind: "not_found" });
    },
    readPage(input) {
      if (input.host === GONE_HOST) {
        return Promise.resolve({ kind: "gone" });
      }
      if (input.host !== PUBLISHED_HOST || input.path !== "/") {
        return Promise.resolve({ kind: "not_found" });
      }
      return Promise.resolve({
        kind: "published",
        page: {
          title: "Home",
          path: "/",
          ast: PAGE_AST,
          media: {},
          tokens: DEFAULT_APPEARANCE_TOKENS,
        },
      });
    },
  };
}

function buildApp() {
  const app = new OpenAPIHono();
  app.use("*", requestIdMiddleware());
  app.onError(globalErrorHandler);
  app.route("/api/v1/storefront", createStorefrontRouter(fakeService()));
  return app;
}

function url(path: string, query: string): string {
  return "http://localhost" + path + "?" + query;
}

async function readProblem(response: Response): Promise<Record<string, unknown>> {
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  const body: unknown = await response.json();
  expect(typeof body).toBe("object");
  return body as Record<string, unknown>;
}

describe("storefront resolve contract", () => {
  it("resolves a published host to public metadata without tenant identifiers", async () => {
    const response = await buildApp().request(url(RESOLVE_PATH, "host=" + PUBLISHED_HOST));
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(storefrontResolveResponseSchema.parse(body)).toEqual({
      title: PUBLISHED_SITE.title,
      status: STOREFRONT_SITE_STATUS.PUBLISHED,
      homePath: PUBLISHED_SITE.homePath,
      defaultLocale: PUBLISHED_SITE.defaultLocale,
      theme: { tokens: PUBLISHED_SITE.tokens },
    });
    expect(JSON.stringify(body)).not.toContain("org_");
    expect(JSON.stringify(body)).not.toContain("site_");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Origin, Host");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("answers a suspended or archived site with GONE", async () => {
    const response = await buildApp().request(url(RESOLVE_PATH, "host=" + GONE_HOST));
    const problem = await readProblem(response);

    expect(response.status).toBe(410);
    expect(problem).toMatchObject({
      type: "/errors/storefront-gone",
      status: 410,
      code: STOREFRONT_ERROR_CODE.GONE,
    });
  });

  it("rejects a missing host as a validation problem", async () => {
    const response = await buildApp().request("http://localhost" + RESOLVE_PATH);
    const problem = await readProblem(response);

    expect(response.status).toBe(422);
    expect(problem).toMatchObject({ code: "VALIDATION_FAILED" });
  });
});

describe("storefront page contract", () => {
  it("returns a published page with only the published AST and token snapshot", async () => {
    const response = await buildApp().request(url(PAGE_PATH, "host=" + PUBLISHED_HOST + "&path=%2F"));
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(storefrontPageResponseSchema.parse(body)).toEqual({
      title: "Home",
      path: "/",
      ast: PAGE_AST,
      media: {},
      tokens: DEFAULT_APPEARANCE_TOKENS,
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("defaults an omitted page path to the home address", async () => {
    const response = await buildApp().request(url(PAGE_PATH, "host=" + PUBLISHED_HOST));

    expect(response.status).toBe(200);
    expect((await response.json()) as { path: string }).toMatchObject({ path: "/" });
  });

  it("answers an unknown host with the same neutral problem as an unknown path", async () => {
    const app = buildApp();
    const unknownHost = await app.request(url(RESOLVE_PATH, "host=" + UNKNOWN_HOST));
    const unknownPath = await app.request(
      url(PAGE_PATH, "host=" + PUBLISHED_HOST + "&path=%2Fmissing")
    );
    const hostProblem = await readProblem(unknownHost);
    const pathProblem = await readProblem(unknownPath);

    expect(unknownHost.status).toBe(404);
    expect(unknownPath.status).toBe(404);
    expect(hostProblem.code).toBe(NOT_FOUND);
    expect(hostProblem).toMatchObject({
      type: "/errors/storefront-not-found",
      status: 404,
      detail: pathProblem.detail,
    });
    expect(JSON.stringify(hostProblem)).not.toContain(UNKNOWN_HOST);
    expect(unknownHost.headers.get("cache-control")).toBe("private, no-store");
    expect(unknownHost.headers.get("set-cookie")).toBeNull();
  });
});
