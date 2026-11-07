import type { NextResponse } from "next/server";
import { QuotaExceededError } from "@suite/core/errors";
import { problemResponse } from "./api-response";

/**
 * FR-025: a refused write names the limit, the measured consumption and the
 * upgrade path. Returning null lets a route keep its existing error handling
 * for every other failure.
 */
export interface QuotaAwareFallback {
  readonly detail: string;
  readonly code?: string;
  readonly title?: string;
  readonly instance?: string;
}

/**
 * One mapper for the simple "otherwise 500" catches: a quota refusal becomes
 * the detailed 409, every other failure becomes the route's existing generic
 * problem. Callers with additional error branches keep using
 * quotaProblemResponse directly.
 */
export function quotaAwareProblemResponse(
  error: unknown,
  fallback: QuotaAwareFallback
): NextResponse {
  const quotaProblem = quotaProblemResponse(error);
  if (quotaProblem !== null) {
    return quotaProblem;
  }
  return problemResponse({
    status: 500,
    code: fallback.code ?? "INTERNAL_SERVER_ERROR",
    title: fallback.title ?? "Internal Server Error",
    detail: fallback.detail,
    instance: fallback.instance,
  });
}

export function quotaProblemResponse(error: unknown): NextResponse | null {
  if (!(error instanceof QuotaExceededError)) {
    return null;
  }

  return problemResponse({
    status: error.status,
    code: error.code,
    title: error.title,
    detail: error.detail,
    type: error.type,
    extra: {
      resourceKey: error.resourceKey,
      limitValue: error.limitValue,
      currentValue: error.currentValue,
      unit: error.unit,
    },
  });
}
