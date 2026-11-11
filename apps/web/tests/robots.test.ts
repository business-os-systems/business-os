import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/robots.txt/route";

const HOST = "acme.businessos.app";

function requestFor(path: string, host = HOST): Request {
  return new Request("https://" + host + path, {
    headers: { "x-forwarded-proto": "https" },
  });
}

beforeEach(() => {
  vi.stubEnv("DOMAIN_ROOT", "businessos.app");
  vi.stubEnv("MARKETING_HOST", "businessos.com");
  vi.stubEnv("OPERATOR_HOST", "platform.businessos.com");
});

describe("per-host robots directives (FR-040, FR-115)", () => {
  it("disallows the workspace, API, preview, auth, build and metadata app paths", async () => {
    const response = GET(requestFor("/robots.txt"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Vary")).toBe("Host");
    for (const path of ["/dashboard", "/api", "/preview", "/login", "/signup", "/_next"]) {
      expect(body).toContain("Disallow: " + path);
    }
    expect(body).toContain("Sitemap: https://" + HOST + "/sitemap.xml");
  });

  it("answers an undeclared host without directives or a cache", async () => {
    const response = GET(requestFor("/robots.txt", "attacker.example"));

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).not.toContain("Sitemap:");
  });
});
