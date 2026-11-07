import { AppError, type InvalidParamDetail } from "@suite/core/errors";
import { parseProblemDetails, type ProblemDetails } from "./api";

/** One presentation contract for an RFC 7807 problem. */
export interface ViewProblem {
  readonly status: number | null;
  readonly title: string;
  readonly detail: string;
  readonly code: string | null;
  readonly requestId: string | null;
  readonly invalidParams: readonly InvalidParamDetail[];
}

const GENERIC_TITLE = "Request failed";
const GENERIC_DETAIL = "The request could not be completed.";

function orDefault<T>(value: T | undefined, fallback: T): T {
  return value ?? fallback;
}

function fromProblemBody(problem: ProblemDetails): ViewProblem {
  return {
    status: orDefault(problem.status, null),
    title: orDefault(problem.title, GENERIC_TITLE),
    detail: orDefault(problem.detail, GENERIC_DETAIL),
    code: orDefault(problem.code, null),
    requestId: orDefault(problem.requestId, null),
    invalidParams: orDefault(problem.invalidParams, []),
  };
}

/** Maps a typed error or a raw RFC 7807 body onto the display contract. */
export function toViewProblem(cause: unknown): ViewProblem {
  if (cause instanceof AppError) {
    return {
      status: cause.status,
      title: cause.title,
      detail: cause.detail,
      code: cause.code,
      requestId: null,
      invalidParams: cause.invalidParams ?? [],
    };
  }

  const problem = parseProblemDetails(cause);
  if (problem !== null) {
    return fromProblemBody(problem);
  }

  return {
    status: null,
    title: GENERIC_TITLE,
    detail: cause instanceof Error ? cause.message : GENERIC_DETAIL,
    code: null,
    requestId: null,
    invalidParams: [],
  };
}
