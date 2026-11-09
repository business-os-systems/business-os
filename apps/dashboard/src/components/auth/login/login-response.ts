import { z } from "zod";
import { readProblemMessage } from "@/components/auth/shared/problem-details";
import { THEME_PREFERENCES } from "@/components/auth/shared/theme-preference";

/**
 * Typed boundary for POST /api/auth/login. The page previously read an untyped
 * JSON body and cascaded through detail/error/fallback (P3/P10/P12).
 */

const onboardingStatusSchema = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
]);

const loginUserSchema = z.object({
  permissions: z.array(z.string()).optional(),
  onboardingStatus: onboardingStatusSchema.optional(),
  currentOnboardingStep: z.number().nullable().optional(),
});

const loginSuccessSchema = z.object({
  themePreference: z.enum(THEME_PREFERENCES).optional(),
  redirectUrl: z.string().min(1).optional(),
  user: loginUserSchema.optional(),
});

export type LoginSuccessPayload = z.infer<typeof loginSuccessSchema>;

export type LoginOutcome =
  | { readonly kind: "success"; readonly payload: LoginSuccessPayload }
  | { readonly kind: "failure"; readonly message: string };

const INVALID_RESPONSE_MESSAGE =
  "The sign-in response was invalid. Reload and try again.";

/**
 * Maps the HTTP response and its JSON body to a discriminated outcome; no
 * caller has to inspect response.ok or construct fallback strings.
 */
export function mapLoginResponse(
  response: Pick<Response, "ok" | "status">,
  body: unknown
): LoginOutcome {
  if (!response.ok) {
    const message =
      readProblemMessage(body) ??
      "Sign-in failed with status " + response.status + ".";
    return { kind: "failure", message };
  }

  const parsed = loginSuccessSchema.safeParse(body);
  if (!parsed.success) {
    return { kind: "failure", message: INVALID_RESPONSE_MESSAGE };
  }
  return { kind: "success", payload: parsed.data };
}