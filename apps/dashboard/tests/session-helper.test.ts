import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import {
  getAuthenticatedSession,
} from "../src/lib/session-helper";
import {
  SESSION_COOKIE_NAME,
  encodeSessionPayload,
  signSessionToken,
  type SessionPayload,
} from "@suite/auth";

describe("Session Helper (@suite/dashboard/lib/session-helper)", () => {
  beforeAll(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret-key-that-is-at-least-32-chars-long!";
  });

  const validPayload: SessionPayload = {
    userId: "usr_alice",
    email: "alice@company.com",
    userName: "Alice Smith",
    organizationId: "org_alpha",
    organizationName: "Alpha Corp",
    timestamp: Date.now(),
  };

  it("returns 401 UNAUTHORIZED when session cookie is absent", async () => {
    const req = new NextRequest("http://localhost:3001/api/v1/apps/pos/install", {
      method: "POST",
    });

    const res = await getAuthenticatedSession(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(401);
      const data = await res.response.json();
      expect(data.code).toBe("UNAUTHORIZED");
    }
  });

  it("returns 401 INVALID_SESSION when signature is tampered", async () => {
    const forgedToken = `${encodeSessionPayload(validPayload)}.bad_signature`;
    const req = new NextRequest("http://localhost:3001/api/v1/apps/pos/install", {
      method: "POST",
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${forgedToken}`,
      },
    });

    const res = await getAuthenticatedSession(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(401);
      const data = await res.response.json();
      expect(data.code).toBe("INVALID_SESSION");
    }
  });

  it("returns 400 ORGANIZATION_REQUIRED when organization is required but missing", async () => {
    const noOrgPayload: SessionPayload = {
      userId: "usr_bob",
      email: "bob@company.com",
      userName: "Bob Jones",
      timestamp: Date.now(),
    };
    const token = await signSessionToken(encodeSessionPayload(noOrgPayload));
    const req = new NextRequest("http://localhost:3001/api/v1/apps/pos/install", {
      method: "POST",
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    });

    const res = await getAuthenticatedSession(req, { requireOrganization: true });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(400);
      const data = await res.response.json();
      expect(data.code).toBe("ORGANIZATION_REQUIRED");
    }
  });

  it("returns ok: true with decoded session payload when valid", async () => {
    const token = await signSessionToken(encodeSessionPayload(validPayload));
    const req = new NextRequest("http://localhost:3001/api/v1/apps/pos/install", {
      method: "POST",
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    });

    const res = await getAuthenticatedSession(req, { requireOrganization: true });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.session.userId).toBe("usr_alice");
      expect(res.session.organizationId).toBe("org_alpha");
    }
  });

  it("returns 401 SESSION_EXPIRED when session token has expired past its temporal boundary", async () => {
    const expiredPayload: SessionPayload = {
      ...validPayload,
      timestamp: Date.now() - 100000,
      expiresAt: Date.now() - 5000, // Expired 5 seconds ago
    };
    const token = await signSessionToken(encodeSessionPayload(expiredPayload));
    const req = new NextRequest("http://localhost:3001/api/v1/apps/pos/install", {
      method: "POST",
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    });

    const res = await getAuthenticatedSession(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(401);
      const data = await res.response.json();
      expect(data.code).toBe("SESSION_EXPIRED");
    }
  });

  it("returns 401 SESSION_IDLE_TIMEOUT when session exceeds user-configured idle timeout", async () => {
    const idlePayload: SessionPayload = {
      ...validPayload,
      timestamp: Date.now() - 1800 * 1000, // 30 minutes ago
      sessionTimeoutSeconds: 900, // 15 minutes timeout
    };
    const token = await signSessionToken(encodeSessionPayload(idlePayload));
    const req = new NextRequest("http://localhost:3001/api/v1/apps/pos/install", {
      method: "POST",
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    });

    const res = await getAuthenticatedSession(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(401);
      const data = await res.response.json();
      expect(data.code).toBe("SESSION_IDLE_TIMEOUT");
    }
  });

  it("correctly identifies expired ephemeral sessions", async () => {
    const ephemeralExpiredPayload: SessionPayload = {
      ...validPayload,
      isEphemeral: true,
      timestamp: Date.now() - 86401 * 1000, // 24 hours + 1 second ago
    };
    const token = await signSessionToken(encodeSessionPayload(ephemeralExpiredPayload));
    const req = new NextRequest("http://localhost:3001/api/v1/apps/pos/install", {
      method: "POST",
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    });

    const res = await getAuthenticatedSession(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(401);
      const data = await res.response.json();
      expect(data.code).toBe("SESSION_EXPIRED");
    }
  });
});
