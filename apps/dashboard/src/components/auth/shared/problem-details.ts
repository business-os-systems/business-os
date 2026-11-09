import { z } from "zod";
import { firstNonEmpty } from "./first-non-empty";

/**
 * RFC 7807 problem-details contract shared by the auth pages. One schema and
 * one message precedence (detail, then error) prevent each page from inventing
 * its own fallback chain (P3/P10).
 */

export const authProblemSchema = z.object({
  code: z.string().min(1).optional(),
  detail: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});

export type AuthProblemDetails = z.infer<typeof authProblemSchema>;

export function readAuthProblem(body: unknown): AuthProblemDetails | null {
  const parsed = authProblemSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function readProblemMessage(body: unknown): string | null {
  const problem = readAuthProblem(body);
  if (problem === null) {
    return null;
  }
  return firstNonEmpty(problem.detail ?? null, problem.error ?? null);
}
