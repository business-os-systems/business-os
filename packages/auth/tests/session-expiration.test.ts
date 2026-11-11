import { describe, it, expect } from "vitest";
import {
  isSessionPayloadExpired,
  isSessionPayloadIdleTimedOut,
  createSessionCookieOptions,
  SESSION_EPHEMERAL_MAX_AGE_SECONDS,
  SESSION_PERSISTENT_MAX_AGE_SECONDS,
  type SessionPayload,
} from "../src/index.js";

describe("Session Lifecycle & Expiration Verification (@suite/auth)", () => {
  const basePayload: SessionPayload = {
    userId: "usr_test_123",
    email: "test@company.com",
    userName: "Test User",
    timestamp: Date.now(),
  };

  it("identifies session as expired when expiresAt is in the past", () => {
    const expired: SessionPayload = {
      ...basePayload,
      timestamp: Date.now() - 10000,
      expiresAt: Date.now() - 1000, // 1s ago
    };
    expect(isSessionPayloadExpired(expired)).toBe(true);
  });

  it("identifies session as valid when expiresAt is in the future", () => {
    const valid: SessionPayload = {
      ...basePayload,
      timestamp: Date.now(),
      expiresAt: Date.now() + 60000, // 1m in future
    };
    expect(isSessionPayloadExpired(valid)).toBe(false);
  });

  it("enforces 24-hour boundary for ephemeral sessions without expiresAt", () => {
    const ephemeralExpired: SessionPayload = {
      ...basePayload,
      isEphemeral: true,
      timestamp: Date.now() - (SESSION_EPHEMERAL_MAX_AGE_SECONDS + 10) * 1000,
    };
    expect(isSessionPayloadExpired(ephemeralExpired)).toBe(true);

    const ephemeralValid: SessionPayload = {
      ...basePayload,
      isEphemeral: true,
      timestamp: Date.now() - 3600 * 1000, // 1 hour ago
    };
    expect(isSessionPayloadExpired(ephemeralValid)).toBe(false);
  });

  it("enforces 30-day boundary for persistent sessions without expiresAt", () => {
    const persistentExpired: SessionPayload = {
      ...basePayload,
      isEphemeral: false,
      timestamp: Date.now() - (SESSION_PERSISTENT_MAX_AGE_SECONDS + 10) * 1000,
    };
    expect(isSessionPayloadExpired(persistentExpired)).toBe(true);

    const persistentValid: SessionPayload = {
      ...basePayload,
      isEphemeral: false,
      timestamp: Date.now() - 7 * 24 * 3600 * 1000, // 7 days ago (< 30 days)
    };
    expect(isSessionPayloadExpired(persistentValid)).toBe(false);
  });

  it("evaluates idle timeout based on user inactivity preferences", () => {
    const timedOut: SessionPayload = {
      ...basePayload,
      timestamp: Date.now() - 1200 * 1000, // 20m ago
      sessionTimeoutSeconds: 900, // 15m idle limit
    };
    expect(isSessionPayloadIdleTimedOut(timedOut)).toBe(true);

    const active: SessionPayload = {
      ...basePayload,
      timestamp: Date.now() - 300 * 1000, // 5m ago
      sessionTimeoutSeconds: 900, // 15m idle limit
    };
    expect(isSessionPayloadIdleTimedOut(active)).toBe(false);
  });

  it("generates cookie options with correct maxAge for ephemeral vs persistent sessions", () => {
    const ephemeralOpts = createSessionCookieOptions(false);
    expect(ephemeralOpts.maxAge).toBe(SESSION_EPHEMERAL_MAX_AGE_SECONDS);

    const persistentOpts = createSessionCookieOptions(true);
    expect(persistentOpts.maxAge).toBe(SESSION_PERSISTENT_MAX_AGE_SECONDS);

    const customOpts = createSessionCookieOptions(false, 3600);
    expect(customOpts.maxAge).toBe(3600);
  });
});