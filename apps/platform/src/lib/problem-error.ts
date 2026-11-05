import {
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from "@suite/core/errors";
import { readProblemDetails } from "./api";

type ProblemErrorFactory = (
  detail: string,
  code: string | undefined
) => Error;

/** One status-to-error registry; a new status is one row, not another branch. */
const PROBLEM_ERRORS: Record<number, ProblemErrorFactory> = {
  401: (detail) => new UnauthorizedError(detail),
  403: (detail) => new ForbiddenError(detail),
  404: (detail) => new NotFoundError(detail),
  409: (detail, code) =>
    new ConflictError(detail, code === undefined ? undefined : { code }),
  422: (detail) => new ValidationError(detail),
  429: (detail) => new RateLimitError(detail),
};

/**
 * Maps an HTTP response onto a typed error that keeps the RFC 7807 detail, so a
 * screen shows the real reason instead of a generic failure message. A 4xx
 * detail is written for the operator; a 5xx detail may be infrastructure text,
 * so it is replaced by a message that carries the correlation id only.
 */
export async function toProblemError(response: Response): Promise<Error> {
  const problem = await readProblemDetails(response);
  const detail =
    (problem.detail ?? problem.title ?? response.statusText) || "Request failed";
  const factory = PROBLEM_ERRORS[response.status];
  if (factory !== undefined) {
    return factory(detail, problem.code);
  }

  const requestId = response.headers.get("x-request-id");
  const suffix = requestId === null ? "" : ` Reference ${requestId}.`;
  return new InternalServerError(
    `The platform API could not complete the request.${suffix}`
  );
}
