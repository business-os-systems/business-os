import { describe, expect, it, vi } from "vitest";
import type { Redis } from "@suite/redis";
import {
  STEP_UP_TOKEN_TTL_SECONDS,
  issueStepUpToken,
  verifyAndConsumeStepUpToken,
} from "../src/platform/index.js";
import { signPlatformToken } from "../src/platform/token.js";

const SECRET = "step-up-test-secret-32-characters";
const OPERATOR_ID = "op_test_1";

function createFakeRedis() {
  const store = new Map<string, string>();
  const set = vi.fn(
    async (key: string, value: string, _mode: string, _ttl: number) => {
      store.set(key, value);
      return "OK";
    }
  );
  const getdel = vi.fn(async (key: string) => {
    const value = store.get(key) ?? null;
    store.delete(key);
    return value;
  });

  return { redis: { set, getdel } as unknown as Redis, set, getdel };
}

describe("@suite/auth - Platform step-up token", () => {
  it("issues a single-use token and consumes it on first verification", async () => {
    const { redis, set } = createFakeRedis();
    const issued = await issueStepUpToken({
      operatorId: OPERATOR_ID,
      secret: SECRET,
      redis,
    });

    expect(set).toHaveBeenCalledWith(
      expect.stringContaining("platform:step-up:"),
      OPERATOR_ID,
      "EX",
      STEP_UP_TOKEN_TTL_SECONDS
    );
    await expect(
      verifyAndConsumeStepUpToken({
        token: issued.token,
        operatorId: OPERATOR_ID,
        secret: SECRET,
        redis,
      })
    ).resolves.toBe(true);
    await expect(
      verifyAndConsumeStepUpToken({
        token: issued.token,
        operatorId: OPERATOR_ID,
        secret: SECRET,
        redis,
      })
    ).resolves.toBe(false);
  });

  it("rejects a token issued for another operator without consuming it", async () => {
    const { redis } = createFakeRedis();
    const issued = await issueStepUpToken({
      operatorId: OPERATOR_ID,
      secret: SECRET,
      redis,
    });

    await expect(
      verifyAndConsumeStepUpToken({
        token: issued.token,
        operatorId: "op_other",
        secret: SECRET,
        redis,
      })
    ).resolves.toBe(false);
    await expect(
      verifyAndConsumeStepUpToken({
        token: issued.token,
        operatorId: OPERATOR_ID,
        secret: SECRET,
        redis,
      })
    ).resolves.toBe(true);
  });

  it("rejects an expired token", async () => {
    const { redis } = createFakeRedis();
    const now = new Date("2026-10-26T10:00:00.000Z");
    const issued = await issueStepUpToken({
      operatorId: OPERATOR_ID,
      secret: SECRET,
      redis,
      now: new Date(now.getTime() - 6 * 60 * 1000),
    });

    await expect(
      verifyAndConsumeStepUpToken({
        token: issued.token,
        operatorId: OPERATOR_ID,
        secret: SECRET,
        redis,
        now,
      })
    ).resolves.toBe(false);
  });

  it("rejects a token with the wrong purpose", async () => {
    const { redis } = createFakeRedis();
    const now = Math.floor(Date.now() / 1000);
    const token = await signPlatformToken(
      {
        purpose: "session",
        sub: OPERATOR_ID,
        jti: "jti_1",
        iat: now,
        exp: now + 300,
      },
      SECRET
    );

    await expect(
      verifyAndConsumeStepUpToken({
        token,
        operatorId: OPERATOR_ID,
        secret: SECRET,
        redis,
      })
    ).resolves.toBe(false);
  });

  it("rejects a tampered token", async () => {
    const { redis } = createFakeRedis();
    const issued = await issueStepUpToken({
      operatorId: OPERATOR_ID,
      secret: SECRET,
      redis,
    });

    await expect(
      verifyAndConsumeStepUpToken({
        token: `${issued.token}tampered`,
        operatorId: OPERATOR_ID,
        secret: SECRET,
        redis,
      })
    ).resolves.toBe(false);
  });
});
