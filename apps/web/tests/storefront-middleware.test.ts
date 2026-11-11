import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware, TENANT_HOST_HEADER } from "../src/middleware";
import { TENANT_SESSION_COOKIE_NAME } from "@suite/auth/session-cookie";
import { PREVIEW_TOKEN_HEADER } from "../src/lib/cache-control";

const pageMocks = vi.hoisted(() => ({ loadStorefrontPage: vi.fn() }));

vi.mock("@/lib/storefront/page-client", () => ({
  loadStorefrontPage: pageMocks.loadStorefrontPage,
}));

const TENANT_REQUEST_HEADER = "x-middleware-request-" + TENANT_HOST_HEADER;
const TENANT_ORIGIN = "https://acme.businessos.app";
const ACME_HOSTNAME = "acme.businessos.app";
const COOKIE_NAME = TENANT_SESSION_COOKIE_NAME;
const CACHE_CONTROL = "Cache-Control";
const VARY = "Vary";
const SET_COOKIE = "set-cookie";
const X_ROBOTS_TAG = "X-Robots-Tag";
const CACHE_KEY_HEADER = "X-Storefront-Cache-Key";

const PUBLISHED = {
  kind: "published" as const,
  page: {
    title: "River View Bistro",
    path: "/",
    ast: { version: 1, schemaVersion: "2026-03", sections: [] },
    media: {},
    tokens: {
      colorBackground: "#FAF3EF",
      colorSurface: "#FFFFFF",
      colorText: "#1E1B19",
      colorTextMuted: "#6E625D",
      colorPrimary: "#A43A2B",
      colorPrimaryContrast: "#FFFFFF",
      colorAccent: "#0F766E",
      colorBorder: "#E9E2DE",
      fontHeading: "Inter, system-ui, sans-serif",
      fontBody: "Inter, system-ui, sans-serif",
      radiusSm: "0.375rem",
      radiusMd: "0.5rem",
      radiusLg: "0.75rem",
      shadowCard: "0 1px 2px rgba(30, 27, 25, 0.08)",
      spaceSection: "4rem",
    },
  },
};

function requestFor(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers });
}

function sessionToken(tenantHost: string): string {
  const payload = Buffer.from(JSON.stringify({ userId: "usr_1", tenantHost })).toString("base64url");
  return payload + ".signature";
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("DOMAIN_ROOT", "businessos.app");
  vi.stubEnv("MARKETING_HOST", "businessos.com");
  vi.stubEnv("OPERATOR_HOST", "platform.businessos.com");
  pageMocks.loadStorefrontPage.mockReset();
  pageMocks.loadStorefrontPage.mockResolvedValue(PUBLISHED);
});

describe("storefront host matrix (T053)", () => {
  it("accepts a known tenant host and forwards the normalized host", async () => {
    const response = await middleware(requestFor(TENANT_ORIGIN + "/about"));

    expect(response.status).toBe(200);
    expect(response.headers.get(TENANT_REQUEST_HEADER)).toBe(ACME_HOSTNAME);
    expect(response.headers.get(VARY)).toBe("Host");
  });

  it("normalizes case and an explicit port before resolving", async () => {
    const response = await middleware(requestFor("https://ACME.BusinessOS.app:8443/about"));

    expect(response.status).toBe(200);
    expect(response.headers.get(TENANT_REQUEST_HEADER)).toBe(ACME_HOSTNAME);
  });

  it("answers an unknown host neutrally without another tenant's content", async () => {
    const response = await middleware(requestFor("https://acme.attacker.example/about"));

    expect(response.status).toBe(404);
    expect(response.headers.get(TENANT_REQUEST_HEADER)).toBeNull();
    expect(response.headers.get(X_ROBOTS_TAG)).toContain("noindex");
  });

  it.each(["businessos.com", "platform.businessos.com"])(
    "never treats the reserved host %s as a tenant",
    async (host) => {
      const response = await middleware(requestFor("https://" + host + "/about"));

      expect(response.status).toBe(404);
      expect(response.headers.get(TENANT_REQUEST_HEADER)).toBeNull();
    }
  );

  it.each(["app", "api", "platform", "www", "dashboard"])(
    "never issues the reserved tenant label %s",
    async (label) => {
      expect((await middleware(requestFor("https://" + label + ".businessos.app/"))).status).toBe(404);
    }
  );

  it("rejects the tenant apex and a malformed Host header neutrally", async () => {
    expect((await middleware(requestFor("https://businessos.app/"))).status).toBe(404);
    expect((await middleware(requestFor("http://[::1]:3000/"))).status).toBe(404);
  });

  it("passes non-storefront paths through and strips spoofed tenant headers", async () => {
    const spoofed = requestFor(TENANT_ORIGIN + "/dashboard", {
      "x-tenant-host": "victim.businessos.app",
      "x-tenant-label": "victim",
    });
    const passThrough = await middleware(spoofed);
    expect(passThrough.status).toBe(200);
    expect(passThrough.headers.get(TENANT_REQUEST_HEADER)).toBeNull();
    expect(passThrough.headers.get(X_ROBOTS_TAG)).toContain("noindex");
    expect(passThrough.headers.get(CACHE_CONTROL)).toBe("private, no-store");
    expect(pageMocks.loadStorefrontPage).not.toHaveBeenCalled();

    const storefront = await middleware(
      requestFor(TENANT_ORIGIN + "/", {
        "x-tenant-host": "victim.businessos.app",
        "x-tenant-label": "victim",
      })
    );
    expect(storefront.headers.get(TENANT_REQUEST_HEADER)).toBe(ACME_HOSTNAME);
    expect(storefront.headers.get("x-middleware-request-x-tenant-label")).toBe("acme");
  });
});

describe("storefront cache headers (T075, FR-042)", () => {
  it("caches a published page per host and path", async () => {
    const response = await middleware(requestFor(TENANT_ORIGIN + "/about"));

    expect(response.headers.get(CACHE_CONTROL)).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400"
    );
    expect(response.headers.get(VARY)).toBe("Host");
    const cacheKey = response.headers.get(CACHE_KEY_HEADER);
    expect(cacheKey).toContain("host=" + ACME_HOSTNAME);
    expect(cacheKey).toContain("path=/about");
  });

  it("short-caches holding states and never stores an upstream failure", async () => {
    pageMocks.loadStorefrontPage.mockResolvedValue({ kind: "not_found" });
    const holding = await middleware(requestFor(TENANT_ORIGIN + "/"));
    expect(holding.headers.get(CACHE_CONTROL)).toContain("s-maxage=60");

    pageMocks.loadStorefrontPage.mockResolvedValue({ kind: "gone" });
    const gone = await middleware(requestFor(TENANT_ORIGIN + "/"));
    expect(gone.headers.get(CACHE_CONTROL)).toContain("s-maxage=60");

    pageMocks.loadStorefrontPage.mockResolvedValue({ kind: "upstream_error" });
    const failed = await middleware(requestFor(TENANT_ORIGIN + "/"));
    expect(failed.headers.get(CACHE_CONTROL)).toBe("no-store");
  });

  it("never stores a preview and varies on the preview token", async () => {
    const response = await middleware(
      requestFor(TENANT_ORIGIN + "/draft", { [PREVIEW_TOKEN_HEADER]: "signed-token" })
    );

    expect(response.headers.get(CACHE_CONTROL)).toBe("private, no-store");
    expect(response.headers.get(VARY)).toBe("Host, " + PREVIEW_TOKEN_HEADER);
    expect(response.headers.get(X_ROBOTS_TAG)).toContain("noindex");
  });

  it("never shares a cache key between two hosts for the same path", async () => {
    const acme = await middleware(requestFor(TENANT_ORIGIN + "/"));
    const beta = await middleware(requestFor("https://beta.businessos.app/"));

    expect(acme.headers.get(CACHE_KEY_HEADER)).not.toBe(
      beta.headers.get(CACHE_KEY_HEADER)
    );
    expect(acme.headers.get(VARY)).toBe("Host");
    expect(beta.headers.get(VARY)).toBe("Host");
  });

  it.each(["/sitemap.xml", "/robots.txt", "/.well-known/security.txt", "/api/v1/health", "/preview/1"])(
    "never treats %s as a storefront page",
    async (path) => {
      const response = await middleware(requestFor(TENANT_ORIGIN + path));

      const isMetadataPath = path === "/sitemap.xml" || path === "/robots.txt";
      expect(response.headers.get(CACHE_CONTROL)).toBe(
        isMetadataPath
          ? "public, s-maxage=3600, stale-while-revalidate=86400"
          : "private, no-store"
      );
      if (!isMetadataPath) {
        expect(response.headers.get(CACHE_KEY_HEADER)).toBeNull();
        expect(pageMocks.loadStorefrontPage).not.toHaveBeenCalled();
      }
    }
  );
});

describe("storefront cookieless sessions (FR-111, T090)", () => {
  it("expires a cross-host session on a workspace path", async () => {
    const response = await middleware(
      requestFor(TENANT_ORIGIN + "/dashboard", {
        cookie: COOKIE_NAME + "=" + sessionToken("beta.businessos.app"),
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get(SET_COOKIE)).toContain(COOKIE_NAME + "=");
    expect(response.headers.get(SET_COOKIE)).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("never writes Set-Cookie on a storefront response", async () => {
    const response = await middleware(
      requestFor(TENANT_ORIGIN + "/about", {
        cookie: COOKIE_NAME + "=" + sessionToken("beta.businessos.app"),
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get(SET_COOKIE)).toBeNull();
  });

  it("leaves a session that belongs to this host untouched", async () => {
    const response = await middleware(
      requestFor(TENANT_ORIGIN + "/about", {
        cookie: COOKIE_NAME + "=" + sessionToken(ACME_HOSTNAME),
      })
    );

    expect(response.headers.get(SET_COOKIE)).toBeNull();
  });
});
