import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";
import {
  SESSION_COOKIE_NAME,
  decodeSessionPayload,
  encodeSessionPayload,
  signSessionToken,
  type SessionPayload,
} from "@/lib/auth-constants";

const SECRET = "test-secret-key-that-is-at-least-32-chars-long!";
const TENANT_HOST = "https://alpha.businessos.app";
const ALPHA_HOSTNAME = "alpha.businessos.app";
const WORKSPACE = "/dashboard";

const BASE_SESSION: SessionPayload = {
  userId: "usr_1",
  email: "owner@example.com",
  userName: "Owner",
  organizationId: "org_1",
  organizationName: "Alpha",
  role: "member",
  permissions: ["*"],
  timestamp: Date.now(),
  onboardingStatus: "COMPLETED",
};

async function signedSession(overrides: Partial<SessionPayload> = {}): Promise<string> {
  return signSessionToken(
    encodeSessionPayload({ ...BASE_SESSION, timestamp: Date.now(), ...overrides })
  );
}

function requestFor(path: string, options: { cookie?: string; host?: string } = {}): NextRequest {
  const headers = new Headers();
  if (options.cookie !== undefined) {
    headers.set("cookie", SESSION_COOKIE_NAME + "=" + options.cookie);
  }
  if (options.host !== undefined) {
    headers.set("host", options.host);
  }
  return new NextRequest(TENANT_HOST + path, { headers });
}

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = SECRET;
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DOMAIN_ROOT = "businessos.app";
});

describe("workspace /dashboard transition (FR-113, T057)", () => {
  it("sends a signed-out workspace request to sign-in with a same-host redirect", async () => {
    const response = await middleware(requestFor("/dashboard/settings/general"));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin).toBe("https://alpha.businessos.app");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect")).toBe("/dashboard/settings/general");
  });

  it("does not loop on the whitelisted auth routes", async () => {
    const paths = ["/login", "/signup", "/forgot-password", "/reset-password"];
    const responses = await Promise.all(paths.map((path) => middleware(requestFor(path))));

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("canonicalises legacy root workspace paths to /dashboard", async () => {
    const response = await middleware(requestFor("/settings/general?tab=members"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      TENANT_HOST + "/dashboard/settings/general?tab=members"
    );
  });

  it("admits a signed-in workspace request and forwards verified tenant context", async () => {
    const response = await middleware(
      requestFor(WORKSPACE + "/sites", { cookie: await signedSession() })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-tenant-id")).toBe("org_1");
    expect(response.headers.get("x-middleware-request-x-tenant-id")).toBe("org_1");
  });
});

describe("host binding and rolling refresh (FR-111, T090)", () => {
  it("rejects a session whose tenant host claim names another host and clears it", async () => {
    const token = await signedSession({ tenantHost: "beta.businessos.app" });

    const response = await middleware(requestFor(WORKSPACE, { cookie: token }));
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
    expect(setCookie).toContain(SESSION_COOKIE_NAME + "=");
    expect(setCookie).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("accepts a session bound to the requesting host", async () => {
    const token = await signedSession({ tenantHost: ALPHA_HOSTNAME });

    const response = await middleware(requestFor(WORKSPACE, { cookie: token }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-tenant-id")).toBe("org_1");
  });

  it("normalises the request host before the binding check", async () => {
    const token = await signedSession({ tenantHost: ALPHA_HOSTNAME });

    const response = await middleware(
      requestFor(WORKSPACE, { cookie: token, host: "ALPHA.BusinessOS.app:443" })
    );

    expect(response.status).toBe(200);
  });

  it("refreshes a rolling session into the host-only cookie", async () => {
    const stale = await signedSession({
      timestamp: Date.now() - 2 * 60 * 60 * 1000,
      tenantHost: ALPHA_HOSTNAME,
    });

    const response = await middleware(requestFor(WORKSPACE, { cookie: stale }));
    const setCookie = response.headers.get("set-cookie") ?? "";
    const serialized = setCookie.toLowerCase();

    expect(response.status).toBe(200);
    expect(setCookie).toContain(SESSION_COOKIE_NAME + "=");
    expect(SESSION_COOKIE_NAME.startsWith("__Host-")).toBe(true);
    expect(serialized).toContain("secure");
    expect(serialized).toContain("httponly");
    expect(serialized).toContain("samesite=lax");
    expect(serialized).toContain("path=/");
    expect(serialized).not.toContain("domain=");
    const refreshedToken = setCookie.split(";")[0]?.split("=")[1] ?? "";
    expect(decodeSessionPayload(refreshedToken)?.tenantHost).toBe(ALPHA_HOSTNAME);
  });
});

describe("reserved paths at the workspace boundary (FR-114)", () => {
  it("never serves a site page for workspace, API, preview or metadata paths", async () => {
    const paths = ["/dashboard", "/api/v1/cms", "/preview/token", "/_next/static/x.js"];
    const responses = await Promise.all(paths.map((path) => middleware(requestFor(path))));

    for (const response of responses) {
      expect(response.status).not.toBe(404);
    }
  });
});
