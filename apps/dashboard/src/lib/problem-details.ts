import { z } from "zod";

/**
 * Lenient RFC 7807 reader for client-side error presentation. It accepts the
 * server envelope without requiring optional fields, and always prefers the
 * backend detail over a locally invented message (Transparent Errors Law).
 */

const invalidParamSchema = z.object({
  name: z.string().min(1),
  reason: z.string().min(1),
});

const problemDetailsBodySchema = z
  .object({
    detail: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    code: z.string().min(1).optional(),
    invalidParams: z.array(invalidParamSchema).optional(),
  })
  .passthrough();

export type ProblemDetailsBody = z.infer<typeof problemDetailsBodySchema>;

export function readProblemDetails(body: unknown): ProblemDetailsBody | null {
  const parsed = problemDetailsBodySchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function readProblemMessage(body: unknown): string | null {
  const problem = readProblemDetails(body);
  if (problem === null) {
    return null;
  }
  if (problem.detail !== undefined) {
    return problem.detail;
  }
  if (problem.title !== undefined) {
    return problem.title;
  }
  return null;
}
