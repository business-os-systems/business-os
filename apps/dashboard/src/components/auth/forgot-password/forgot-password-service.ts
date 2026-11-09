import { readJsonBody } from "@/components/auth/shared/read-json-body";
import {
  FORGOT_PASSWORD_RATE_LIMIT_MESSAGE,
  mapForgotPasswordResponse,
  type ForgotPasswordOutcome,
} from "./forgot-password-status";

const FORGOT_PASSWORD_ENDPOINT = "/api/auth/forgot-password";

export interface ForgotPasswordRequest {
  email: string;
  turnstileToken: string | null;
}

/**
 * Sends the recovery request and maps every transport outcome to a typed
 * result; a rejected promise never reaches the page (P9/P12).
 */
export async function requestPasswordReset(
  request: ForgotPasswordRequest
): Promise<ForgotPasswordOutcome> {
  try {
    const response = await fetch(FORGOT_PASSWORD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: request.email,
        turnstileToken: request.turnstileToken,
      }),
    });
    const body = await readJsonBody(response);
    return mapForgotPasswordResponse(response, body);
  } catch (error) {
    return {
      kind: "failed",
      message:
        error instanceof Error
          ? error.message
          : FORGOT_PASSWORD_RATE_LIMIT_MESSAGE,
    };
  }
}
