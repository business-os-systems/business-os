import { describe, expect, it, vi } from "vitest";
import type { Redis } from "@suite/redis";
import {
  startAuthentication,
  startRegistration,
} from "../src/services/admin/platform-webauthn.service.js";

function createRedis(): Redis {
  return {
    set: vi.fn(async () => "OK"),
    get: vi.fn(async () => null),
    getdel: vi.fn(async () => null),
  } as unknown as Redis;
}

const config = {
  rpID: "localhost",
  rpName: "Business OS Platform",
  origin: "http://localhost:3002",
};

describe("Platform WebAuthn options", () => {
  it("requires a discoverable, user-verified registration passkey", async () => {
    const result = await startRegistration({
      redis: createRedis(),
      config,
      operator: {
        id: "op_1",
        email: "ops@example.com",
        displayName: "Ops",
      },
      tokenHash: "token-hash",
    });

    expect(result.options.rp.id).toBe("localhost");
    expect(result.options.authenticatorSelection?.residentKey).toBe("required");
    expect(result.options.authenticatorSelection?.userVerification).toBe(
      "required"
    );
  });

  it("requires user verification and no credential allow-list for sign-in", async () => {
    const result = await startAuthentication(createRedis(), config);

    expect(result.options.rpId).toBe("localhost");
    expect(result.options.userVerification).toBe("required");
    expect(result.options.allowCredentials).toEqual([]);
  });
});
