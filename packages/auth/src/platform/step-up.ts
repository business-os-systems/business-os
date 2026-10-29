import { z } from "zod";
import type { Redis } from "@suite/redis";
import { signPlatformToken, verifyPlatformToken } from "./token.js";

export const STEP_UP_TOKEN_TTL_SECONDS = 5 * 60;
export const STEP_UP_NONCE_PREFIX = "platform:step-up:";

const stepUpClaimsSchema = z.object({
  purpose: z.literal("step-up"),
  sub: z.string().min(1),
  jti: z.string().min(1),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
});

export type StepUpClaims = z.infer<typeof stepUpClaimsSchema>;

export interface IssueStepUpTokenInput {
  readonly operatorId: string;
  readonly secret: string;
  readonly redis: Redis;
  readonly now?: Date;
}

export interface IssuedStepUpToken {
  readonly token: string;
  readonly expiresAt: Date;
}

export interface VerifyStepUpTokenInput {
  readonly token: string;
  readonly operatorId: string;
  readonly secret: string;
  readonly redis: Redis;
  readonly now?: Date;
}

export function stepUpNonceKey(jti: string): string {
  return `${STEP_UP_NONCE_PREFIX}${jti}`;
}

export async function issueStepUpToken(
  input: IssueStepUpTokenInput
): Promise<IssuedStepUpToken> {
  const now = input.now ?? new Date();
  const jti = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + STEP_UP_TOKEN_TTL_SECONDS * 1000);
  const claims: StepUpClaims = {
    purpose: "step-up",
    sub: input.operatorId,
    jti,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
  };

  const token = await signPlatformToken(claims, input.secret);
  await input.redis.set(
    stepUpNonceKey(jti),
    input.operatorId,
    "EX",
    STEP_UP_TOKEN_TTL_SECONDS
  );

  return { token, expiresAt };
}

export async function verifyAndConsumeStepUpToken(
  input: VerifyStepUpTokenInput
): Promise<boolean> {
  if (input.token.split(".").length !== 2) {
    return false;
  }

  const payload = await verifyPlatformToken(input.token, input.secret);
  if (payload === null) {
    return false;
  }

  const claimsResult = stepUpClaimsSchema.safeParse(payload);
  if (!claimsResult.success) {
    return false;
  }
  const claims = claimsResult.data;
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);

  if (claims.exp <= nowSeconds) {
    return false;
  }
  if (claims.sub !== input.operatorId) {
    return false;
  }

  const storedOperatorId = await input.redis.getdel(stepUpNonceKey(claims.jti));
  return storedOperatorId === input.operatorId;
}
