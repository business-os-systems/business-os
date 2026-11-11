import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/sitemap.xml/route";

const HOST = "acme.businessos.app";
const ORIGIN = "https://" + HOST;
const SITEMAP_ROUTE = "/sitemap.xml";
const SITEMAP_BODY = {
  site: { title: "River View Bistro", homePath: "/", defaultLocale: "en" },
  pages: [
    { path: "/", lastModified: "2026-11-11T00:00:00.000Z" },
    { path: "/about", lastModified: "2026-11-11T01:00:00.000Z" },
    { path: "/old-home", lastModified: "2026-11-11T02:00:00.000Z" },
    { path: "/dashboard", lastModified: "2026-11-11T03:00:00.000Z" },
  ],
  redirects: [{ sourcePath: "/old-home", targetPath: "/" }],
};

function requestFor(path: string, host = HOST): Request {
  return new Request("https://" + host + path, {
    headers: { "x-forwarded-proto": "https" },
  });
}

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubEnv("API_URL", "http://localhost:4000");
  vi.stubEnv("DOMAIN_ROOT", "businessos.app");
  vi.stubEnv("MARKETING_HOST", "businessos.com");
  vi.stubEnv("OPERATOR_HOST", "platform.businessos.com");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("per-host sitemap (FR-040, FR-042)", () => {
  it("lists published pages only, excludes redirected and reserved paths and uses absolute host URLs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, SITEMAP_BODY)));

    const response = await GET(requestFor(SITEMAP_ROUTE));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toContain("s-maxage");
    expect(response.headers.get("Vary")).toBe("Host");
    expect(body).toContain("<loc>" + ORIGIN + "/</loc>");
    expect(body).toContain("<loc>" + ORIGIN + "/about</loc>");
    expect(body).not.toContain("/old-home");
    expect(body).not.toContain("/dashboard");
  });

  it("asks the published-only sitemap contract for the normalized host", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, SITEMAP_BODY));
    vi.stubGlobal("fetch", fetchMock);

    await GET(requestFor(SITEMAP_ROUTE));

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain("/api/v1/storefront/sitemap");
    expect(requestedUrl).toContain("host=" + HOST);
  });

  it("answers an unresolved host or an upstream failure without a cache", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(404, {})));
    const unavailable = await GET(requestFor(SITEMAP_ROUTE));
    expect(unavailable.status).toBe(404);
    expect(unavailable.headers.get("Cache-Control")).toBe("private, no-store");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(500, {})));
    const failure = await GET(requestFor(SITEMAP_ROUTE));
    expect(failure.status).toBe(503);
    expect(failure.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("refuses a host outside the declared tenant domain", async () => {
    const response = await GET(requestFor(SITEMAP_ROUTE, "attacker.example"));

    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
  });
});
