import {
  MAX_STEP_UP_TOKEN_LENGTH,
  PLATFORM_ERROR_CODE,
  getPlatformErrorDefinition,
} from "@suite/core";
import { ForbiddenError } from "@suite/core/errors";
import { verifyAndConsumeStepUpToken } from "@suite/auth/platform";
import { getControlSessionSecret } from "../../lib/platform-env.js";
import { getPlatformRedis } from "../../lib/platform-db.js";

export interface StepUpConfirmationInput {
  readonly operatorId: string;
  /** The raw x-step-up-token header; null when the caller sent none. */
  readonly token: string | null;
}

function stepUpRequired(): ForbiddenError {
  const definition = getPlatformErrorDefinition(PLATFORM_ERROR_CODE.STEP_UP_REQUIRED);
  return new ForbiddenError(
    "A fresh step-up confirmation is required for this change.",
    {
      code: PLATFORM_ERROR_CODE.STEP_UP_REQUIRED,
      title: definition.title,
    }
  );
}

/**
 * Consumes one single-use step-up token as the first step of a mutation
 * transaction (FR-046, CT-1). A missing, expired, replayed or wrong-operator
 * token fails closed before any row is written; the Redis nonce is deleted on
 * the one successful call, so a replay can never reach the mutation.
 */
export async function assertFreshStepUp(
  input: StepUpConfirmationInput
): Promise<void> {
  const token = input.token?.trim() ?? "";
  if (token === "" || token.length > MAX_STEP_UP_TOKEN_LENGTH) {
    throw stepUpRequired();
  }

  const valid = await verifyAndConsumeStepUpToken({
    token,
    operatorId: input.operatorId,
    secret: getControlSessionSecret(),
    redis: getPlatformRedis(),
  });
  if (!valid) {
    throw stepUpRequired();
  }
}
