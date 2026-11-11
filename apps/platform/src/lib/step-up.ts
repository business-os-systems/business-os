import {
  browserSupportsWebAuthn,
  startAuthentication,
} from "@simplewebauthn/browser";
import { z } from "zod";
import {
  PLATFORM_API_PATHS,
  platformFetch,
  readProblem,
  readSuccessData,
} from "./api";
import { parseRequestOptions } from "./webauthn-options";

const signInOptionsSchema = z.object({
  flowId: z.string().min(1),
  options: z.record(z.unknown()),
});

const confirmationSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().min(1),
});

/** Raised when a fresh passkey assertion cannot be obtained. */
export class StepUpUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StepUpUnavailableError";
  }
}

async function readFailure(response: Response): Promise<StepUpUnavailableError> {
  return new StepUpUnavailableError(await readProblem(response));
}

async function verifyStepUp(
  flowId: string,
  response: unknown
): Promise<string> {
  const verified = await platformFetch(PLATFORM_API_PATHS.stepUpVerify, {
    method: "POST",
    body: JSON.stringify({ flowId, response }),
  });
  if (!verified.ok) {
    throw await readFailure(verified);
  }
  return (await readSuccessData(verified, confirmationSchema)).token;
}

/**
 * One fresh passkey assertion in exchange for a single-use step-up token.
 * The token is kept in memory and sent as x-step-up-token, never a cookie.
 */
export async function requestStepUpToken(): Promise<string> {
  if (!browserSupportsWebAuthn()) {
    throw new StepUpUnavailableError(
      "This browser cannot confirm a passkey. Use a passkey-capable device."
    );
  }
  const optionsResponse = await platformFetch(PLATFORM_API_PATHS.signInOptions, {
    method: "POST",
  });
  if (!optionsResponse.ok) {
    throw await readFailure(optionsResponse);
  }
  const { flowId, options } = await readSuccessData(
    optionsResponse,
    signInOptionsSchema
  );
  const assertion = await startAuthentication({
    optionsJSON: parseRequestOptions(options),
  });
  return verifyStepUp(flowId, assertion);
}
