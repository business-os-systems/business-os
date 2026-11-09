import { PLATFORM_ERROR_CODE } from "@suite/core";
import {
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
  AppError,
  type InvalidParamDetail,
} from "@suite/core/errors";
import { readProblemDetails, type ProblemDetails } from "./api";

type ProblemErrorFactory = (problem: ProblemDetails, detail: string) => Error;

/** One status-to-error registry; a new status is one row, not another branch. */
const PROBLEM_ERRORS: Record<number, ProblemErrorFactory> = {
  401: (problem, detail) =>
    new UnauthorizedError(detail, {
      code: problem.code ?? PLATFORM_ERROR_CODE.AUTH_REQUIRED,
    }),
  403: (problem, detail) =>
    new ForbiddenError(detail, {
      code: problem.code ?? PLATFORM_ERROR_CODE.CAPABILITY_DENIED,
    }),
  404: (problem, detail) =>
    new NotFoundError(
      detail,
      problem.code === undefined ? undefined : { code: problem.code }
    ),
  409: (problem, detail) =>
    new ConflictError(
      detail,
      problem.code === undefined ? undefined : { code: problem.code }
    ),
  422: (problem, detail) =>
    new ValidationError(detail, problem.invalidParams, {
      code: problem.code ?? PLATFORM_ERROR_CODE.VALIDATION_FAILED,
    }),
  429: (problem, detail) =>
    new RateLimitError(detail, undefined, {
      code: problem.code ?? PLATFORM_ERROR_CODE.RATE_LIMITED,
    }),
};

/** A 4xx validation problem, with its field-level details, or no detail. */
export function readInvalidParams(
  cause: unknown
): readonly InvalidParamDetail[] {
  if (
    cause instanceof AppError &&
    cause.status === 422 &&
    cause.invalidParams !== undefined
  ) {
    return cause.invalidParams;
  }
  return [];
}

/** One conflict predicate for the three versioned editors. */
export function isConflictError(cause: unknown): boolean {
  return cause instanceof AppError && cause.status === 409;
}

/**
 * Catalog writes can return two different 409s: a stale version, which a
 * reload resolves, and a duplicate code, which only a different code resolves.
 * The UI offers "Reload catalog" for the first and never for the second.
 */
export function isCatalogVersionConflict(cause: unknown): boolean {
  return (
    cause instanceof AppError &&
    cause.status === 409 &&
    cause.code === PLATFORM_ERROR_CODE.CATALOG_VERSION_CONFLICT
  );
}

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
    return factory(problem, detail);
  }

  const requestId = response.headers.get("x-request-id");
  const suffix = requestId === null ? "" : ` Reference ${requestId}.`;
  return new InternalServerError(
    `The platform API could not complete the request.${suffix}`
  );
}
