import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveRequestOrigin } from "@/lib/origin";

describe("Canonical Request Origin Resolver (resolveRequestOrigin)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("resolves public HTTPS origin from reverse proxy forwarded headers", () => {
    const request = new Request("http://127.0.0.1:3001/api/auth/oauth/github", {
      headers: {
        "x-forwarded-host": "app.rohitbahuguna.online",
        "x-forwarded-proto": "https",
      },
    });

    const origin = resolveRequestOrigin(request);
    expect(origin).toBe("https://app.rohitbahuguna.online");
  });

  it("resolves tenant subdomain origin dynamically from forwarded headers", () => {
    const request = new Request("http://0.0.0.0:3001/api/v1/auth/session", {
      headers: {
        "x-forwarded-host": "hotel.rohitbahuguna.online",
        "x-forwarded-proto": "https",
      },
    });

    const origin = resolveRequestOrigin(request);
    expect(origin).toBe("https://hotel.rohitbahuguna.online");
  });

  it("resolves from Host header when X-Forwarded-Host is absent", () => {
    const request = new Request("http://localhost:3001/login", {
      headers: {
        host: "localhost:3001",
      },
    });

    const origin = resolveRequestOrigin(request);
    expect(origin).toBe("http://localhost:3001");
  });

  it("falls back to pre-declared NEXT_PUBLIC_APP_URL when proxy host is wildcard or absent", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.rohitbahuguna.online/";
    const request = new Request("http://0.0.0.0:3001/api/auth/callback/github", {
      headers: {
        host: "0.0.0.0:3001",
      },
    });

    const origin = resolveRequestOrigin(request);
    expect(origin).toBe("https://app.rohitbahuguna.online");
  });

  it("falls back to request URL origin when no proxy headers exist", () => {
    const request = new Request("http://localhost:3001/auth/callback");
    const origin = resolveRequestOrigin(request);
    expect(origin).toBe("http://localhost:3001");
  });

  it("strips trailing slashes from resolved origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.rohitbahuguna.online///";
    const request = new Request("http://0.0.0.0:3001/");

    const origin = resolveRequestOrigin(request);
    expect(origin).toBe("https://app.rohitbahuguna.online");
  });
});
