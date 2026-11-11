import { describe, expect, it } from "vitest";
import {
  PREVIEW_TOKEN_HEADER,
  cacheStateForPageResult,
  storefrontCacheHeaders,
  storefrontCacheKey,
  type StorefrontCacheState,
} from "../src/lib/cache-control";

const ACME = "acme.businessos.app";
const BETA = "beta.businessos.app";
const HOME = "/";

interface HeaderOptions {
  readonly host?: string;
  readonly path?: string;
  readonly previewToken?: string | null;
}

function headersFor(state: StorefrontCacheState, options: HeaderOptions = {}) {
  return storefrontCacheHeaders({
    state,
    host: options.host ?? ACME,
    path: options.path ?? HOME,
    previewToken: options.previewToken ?? null,
  });
}

describe("storefront cache policies (T075, FR-042)", () => {
  it("caches a published page publicly for an hour and revalidates in the background", () => {
    const headers = headersFor("published", { path: "/about" });

    expect(headers["Cache-Control"]).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400"
    );
    expect(headers.Vary).toBe("Host");
    expect(headers["X-Robots-Tag"]).toBe("index, follow");
  });

  it("short-caches holding and gone responses without sharing the published entry", () => {
    const holding = headersFor("holding");
    const gone = headersFor("gone");

    expect(holding["Cache-Control"]).toContain("s-maxage=60");
    expect(gone["Cache-Control"]).toContain("s-maxage=60");
    expect(holding["Cache-Control"]).not.toContain("s-maxage=3600");
    expect(gone["Cache-Control"]).not.toContain("s-maxage=3600");
    expect(holding["X-Robots-Tag"]).toBe("noindex, nofollow");
  });

  it("never stores a failed delivery", () => {
    expect(headersFor("error")["Cache-Control"]).toBe("no-store");
  });

  it("never stores a preview response and varies on the preview token", () => {
    const headers = headersFor("published", { previewToken: "signed-token" });

    expect(headers["Cache-Control"]).toBe("private, no-store");
    expect(headers.Vary).toBe("Host, " + PREVIEW_TOKEN_HEADER);
    expect(headers["X-Robots-Tag"]).toBe("noindex, nofollow");
  });
});

describe("storefront cache identity (FR-042)", () => {
  it("builds a host-and-path cache key so a path alone is never a key", () => {
    const acmeHome = storefrontCacheKey({ host: ACME, path: HOME });
    const betaHome = storefrontCacheKey({ host: BETA, path: HOME });
    const acmeAbout = storefrontCacheKey({ host: ACME, path: "/about" });

    expect(acmeHome).toContain("host=" + ACME);
    expect(acmeHome).toContain("path=/");
    expect(acmeHome).not.toBe(betaHome);
    expect(acmeHome).not.toBe(acmeAbout);
    expect(acmeHome).toBe(storefrontCacheKey({ host: ACME, path: HOME }));
  });

  it("cannot serve one host's cached page to another host", () => {
    const cache = new Map<string, string>();
    const pageFor = (host: string): string => {
      const key = storefrontCacheKey({ host, path: HOME });
      const cached = cache.get(key);
      if (cached !== undefined) {
        return cached;
      }
      const rendered = "<html>" + host + "</html>";
      cache.set(key, rendered);
      return rendered;
    };

    expect(pageFor(ACME)).toContain(ACME);
    expect(pageFor(BETA)).toContain(BETA);
    expect(pageFor(ACME)).not.toContain(BETA);
    expect(cache.size).toBe(2);
  });

  it("maps every resolution state onto exactly one cache state", () => {
    expect(cacheStateForPageResult({ kind: "published" })).toBe("published");
    expect(cacheStateForPageResult({ kind: "not_found" })).toBe("holding");
    expect(cacheStateForPageResult({ kind: "gone" })).toBe("gone");
    expect(cacheStateForPageResult({ kind: "upstream_error" })).toBe("error");
  });
});
