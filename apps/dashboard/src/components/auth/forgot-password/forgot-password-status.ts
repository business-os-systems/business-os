import type { AuthProblemDetails } from "@/components/auth/shared/problem-details";
import { readAuthProblem } from "@/components/auth/shared/problem-details";
import { firstNonEmpty } from "@/components/auth/shared/first-non-empty";

/**
 * Status/error mapper for POST /api/auth/forgot-password. The anti-enumeration
 * rule is preserved: an unknown address (404) and an unparseable failure both
 * report success, while rate limiting and genuine problem details surface (P3).
 */

export const FORGOT_PASSWORD_RATE_LIMIT_MESSAGE =
  "Rate limit exceeded. Maximum 5 password reset requests allowed per hour.";
const GENERIC_FAILURE_MESSAGE = "Failed to process request";
const NOT_FOUND_STATUS = 404;
const RATE_LIMIT_STATUS = 429;

export type ForgotPasswordOutcome =
  | { readonly kind: "sent" }
  | { readonly kind: "failed"; readonly message: string };

function mapRateLimit(problem: AuthProblemDetails | null): ForgotPasswordOutcome {
  return {
    kind: "failed",
    message: problem?.detail ?? FORGOT_PASSWORD_RATE_LIMIT_MESSAGE,
  };
}

function mapFailure(problem: AuthProblemDetails | null): ForgotPasswordOutcome {
  const message = firstNonEmpty(problem?.detail ?? null, problem?.error ?? null);
  if (message === null || message === GENERIC_FAILURE_MESSAGE) {
    return { kind: "sent" };
  }
  return { kind: "failed", message };
}

export function mapForgotPasswordResponse(
  response: Pick<Response, "ok" | "status">,
  body: unknown
): ForgotPasswordOutcome {
  if (response.ok || response.status === NOT_FOUND_STATUS) {
    return { kind: "sent" };
  }
  const problem = readAuthProblem(body);
  if (response.status === RATE_LIMIT_STATUS) {
    return mapRateLimit(problem);
  }
  return mapFailure(problem);
}
