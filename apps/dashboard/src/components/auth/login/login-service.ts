import type { AuthCredentialsData } from "@/components/auth/shared/credentials";
import { readJsonBody } from "@/components/auth/shared/read-json-body";
import { mapLoginResponse, type LoginOutcome } from "./login-response";

const LOGIN_ENDPOINT = "/api/auth/login";
const NETWORK_FAILURE_MESSAGE = "Failed to sign in";

/**
 * Single HTTP client for the sign-in endpoint. Transport failures become a
 * failed outcome, so the page never handles a rejected promise (P9/P12).
 */
export async function requestLogin(
  credentials: AuthCredentialsData
): Promise<LoginOutcome> {
  try {
    const response = await fetch(LOGIN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
        keepSignedIn: credentials.keepSignedIn,
        turnstileToken: credentials.turnstileToken,
      }),
    });
    const body = await readJsonBody(response);
    return mapLoginResponse(response, body);
  } catch (error) {
    return {
      kind: "failure",
      message:
        error instanceof Error ? error.message : NETWORK_FAILURE_MESSAGE,
    };
  }
}