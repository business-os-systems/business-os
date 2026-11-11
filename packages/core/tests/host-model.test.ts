import { describe, expect, it } from "vitest";
import {
  HOST_ROLES,
  getHostModelConfig,
  isTenantHostResolution,
  readNormalizedRequestHost,
  resolveHost,
  type HostModelConfig,
} from "../src/index.js";
import {
  getTenantHostLabel,
  isNonStorefrontPath,
  isReservedHostLabel,
  isReservedPath,
  isSiteMetadataPath,
  normalizeHostname,
  normalizePathname,
  RESERVED_HOST_LABELS,
} from "../src/constants/reserved.js";

const TENANT_ROOT = "businessos.app";
const MARKETING_HOST = "businessos.com";
const OPERATOR_HOST = "platform.businessos.com";
const ACME_HOST = "acme." + TENANT_ROOT;

const CONFIG: HostModelConfig = {
  tenantRootDomain: TENANT_ROOT,
  marketingHost: MARKETING_HOST,
  operatorHost: OPERATOR_HOST,
};

describe("normalizeHostname", () => {
  it("lower-cases, strips the port and removes a trailing root dot", () => {
    expect(normalizeHostname("Acme.BusinessOS.app:3003")).toBe(ACME_HOST);
    expect(normalizeHostname("  acme.businessos.app.  ")).toBe(ACME_HOST);
  });

  it("preserves localhost for local development", () => {
    expect(normalizeHostname("LOCALHOST:3000")).toBe("localhost");
  });

  it.each([
    ["", "empty"],
    ["   ", "blank"],
    ["acme businessos.app", "space"],
    ["acme..businessos.app", "empty label"],
    ["-acme.businessos.app", "leading hyphen"],
    ["acme-.businessos.app", "trailing hyphen"],
    ["[::1]:3000", "bracketed IPv6"],
    ["acme.businessos.app:not-a-port", "non-numeric port"],
    ["acme.businessos.app:80:90", "two ports"],
  ])("rejects malformed host %j (%s)", (host) => {
    expect(normalizeHostname(host)).toBeNull();
  });
});

describe("resolveHost host matrix", () => {
  it("resolves a known tenant host to the tenant role and label", () => {
    const resolution = resolveHost({ hostHeader: "ACME.businessos.app:443", config: CONFIG });
    expect(resolution).toEqual({
      role: HOST_ROLES.TENANT,
      hostname: ACME_HOST,
      tenantLabel: "acme",
    });
    expect(isTenantHostResolution(resolution)).toBe(true);
  });

  it("rejects an unknown host outside the declared tenant root", () => {
    const resolution = resolveHost({ hostHeader: "acme.attacker.example", config: CONFIG });
    expect(resolution.role).toBe(HOST_ROLES.UNKNOWN);
    expect(resolution.tenantLabel).toBeNull();
  });

  it("resolves the marketing and operator hosts to their own roles", () => {
    expect(resolveHost({ hostHeader: MARKETING_HOST, config: CONFIG }).role).toBe(
      HOST_ROLES.MARKETING
    );
    expect(resolveHost({ hostHeader: "platform.businessos.com", config: CONFIG }).role).toBe(
      HOST_ROLES.OPERATOR
    );
  });

  it("never treats a reserved label under the tenant root as a tenant", () => {
    for (const label of ["app", "api", "platform", "www", "dashboard"]) {
      const resolution = resolveHost({ hostHeader: label + ".businessos.app", config: CONFIG });
      expect(resolution.role).toBe(HOST_ROLES.UNKNOWN);
    }
  });

  it("never treats the tenant apex or a nested subdomain as a tenant", () => {
    expect(resolveHost({ hostHeader: TENANT_ROOT, config: CONFIG }).role).toBe(
      HOST_ROLES.UNKNOWN
    );
    expect(resolveHost({ hostHeader: "a.b.businessos.app", config: CONFIG }).role).toBe(
      HOST_ROLES.UNKNOWN
    );
  });

  it("treats a malformed Host header as unknown and does not echo it", () => {
    const resolution = resolveHost({ hostHeader: "bad host", config: CONFIG });
    expect(resolution).toEqual({ role: HOST_ROLES.UNKNOWN, hostname: null, tenantLabel: null });
  });

  it("fails closed when the tenant root is not configured", () => {
    const resolution = resolveHost({
      hostHeader: ACME_HOST,
      config: { tenantRootDomain: null, marketingHost: null, operatorHost: null },
    });
    expect(resolution.role).toBe(HOST_ROLES.UNKNOWN);
  });
});

describe("getHostModelConfig", () => {
  it("reads every host from declared configuration", () => {
    expect(
      getHostModelConfig({
        DOMAIN_ROOT: "BusinessOS.app",
        MARKETING_HOST: MARKETING_HOST,
        OPERATOR_HOST: "platform.businessos.com",
      })
    ).toEqual(CONFIG);
  });

  it("keeps unconfigured hosts null instead of defaulting them", () => {
    expect(getHostModelConfig({})).toEqual({
      tenantRootDomain: null,
      marketingHost: null,
      operatorHost: null,
    });
  });
});

describe("reserved host and path registry", () => {
  it("declares every reserved label uniquely", () => {
    expect(new Set(RESERVED_HOST_LABELS).size).toBe(RESERVED_HOST_LABELS.length);
  });

  it("rejects reserved labels and accepts ordinary ones", () => {
    expect(isReservedHostLabel("platform")).toBe(true);
    expect(isReservedHostLabel("acme")).toBe(false);
  });

  it("extracts only a single non-reserved tenant label", () => {
    expect(getTenantHostLabel(ACME_HOST, TENANT_ROOT)).toBe("acme");
    expect(getTenantHostLabel("a.b.businessos.app", TENANT_ROOT)).toBeNull();
    expect(getTenantHostLabel(TENANT_ROOT, TENANT_ROOT)).toBeNull();
  });

  it.each([
    "/dashboard",
    "/dashboard/settings",
    "/login",
    "/signup",
    "/api/v1/cms",
    "/_next/static/chunk.js",
    "/preview/token",
    "/.well-known/acme",
    "/sitemap.xml",
    "/robots.txt",
    "/favicon.ico",
  ])("reserves platform path %s", (path) => {
    expect(isReservedPath(path)).toBe(true);
    expect(isNonStorefrontPath(path)).toBe(true);
  });

  it.each(["/", "/about", "/site-map", "/dashboarding", "/apiary"])(
    "does not reserve ordinary page path %s",
    (path) => {
      expect(isReservedPath(path)).toBe(false);
    }
  );

  it("normalizes paths before matching", () => {
    expect(normalizePathname("dashboard/")).toBe("/dashboard");
    expect(normalizePathname("/")).toBe("/");
    expect(isReservedPath("dashboard/")).toBe(true);
  });

  it("recognises only the declared metadata files", () => {
    expect(isSiteMetadataPath("/sitemap.xml")).toBe(true);
    expect(isSiteMetadataPath("/sitemap.xml/extra")).toBe(false);
    expect(isSiteMetadataPath("/about")).toBe(false);
  });
});
describe("readNormalizedRequestHost", () => {
  function headers(values: Record<string, string>): { get(name: string): string | null } {
    return { get: (name) => values[name.toLowerCase()] ?? null };
  }

  it("prefers the Host authority over a client-supplied forwarded header", () => {
    const hostname = readNormalizedRequestHost({
      headers: headers({
        host: "ACME.businessos.app:443",
        "x-forwarded-host": "attacker.example",
      }),
      fallbackHost: "fallback.example",
    });

    expect(hostname).toBe(ACME_HOST);
  });

  it("uses a forwarded host only when the Host header is absent", () => {
    expect(
      readNormalizedRequestHost({
        headers: headers({ "x-forwarded-host": "acme.businessos.app, proxy.internal" }),
      })
    ).toBe(ACME_HOST);
  });

  it("falls back to the parsed request URL and rejects malformed candidates", () => {
    expect(readNormalizedRequestHost({ headers: headers({}), fallbackHost: ACME_HOST })).toBe(
      ACME_HOST
    );
    expect(
      readNormalizedRequestHost({ headers: headers({ host: "bad host" }), fallbackHost: ACME_HOST })
    ).toBe(ACME_HOST);
    expect(readNormalizedRequestHost({ headers: headers({}), fallbackHost: null })).toBeNull();
  });
});
