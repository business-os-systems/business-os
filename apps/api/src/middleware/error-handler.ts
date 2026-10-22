import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import * as Sentry from "@sentry/node";
import { AppError, InternalServerError } from "@suite/core/errors";
import { logger } from "@suite/logger";

/**
 * Global RFC 7807 Problem Details Error Handler for Hono API.
 * Guarantees zero sensitive internal stack trace leakage on unhandled exceptions.
 */
export const globalErrorHandler: ErrorHandler = (err, c) => {
  const requestId = c.get("requestId");
  const instance = c.req.path;
  const timestamp = new Date().toISOString();

  // 1. Domain AppError hierarchy (@suite/core)
  if (err instanceof AppError) {
    const problem = { ...err.toProblemDetails(requestId), instance };

    // If client error (4xx), log at warn level; if server error (5xx), log at error level
    if (err.status >= 500) {
      logger.error(
        { err, problem, requestId, path: instance },
        `Application error [${err.code}]: ${err.message}`
      );
      Sentry.captureException(err, { extra: { requestId, path: instance, code: err.code } });
    } else {
      logger.warn(
        { problem, requestId, path: instance },
        `Client error [${err.code}]: ${err.message}`
      );
    }

    return new Response(JSON.stringify(problem), {
      status: err.status,
      headers: { "Content-Type": "application/problem+json; charset=utf-8" },
    });
  }

  // 2. Hono Native HTTPException
  if (err instanceof HTTPException) {
    const status = err.status;
    const problem = {
      type: status >= 500 ? "/errors/internal-server-error" : "/errors/http-exception",
      title: status >= 500 ? "Internal Server Error" : "Bad Request",
      status,
      detail: err.message,
      code: status >= 500 ? "INTERNAL_SERVER_ERROR" : "HTTP_EXCEPTION",
      instance,
      requestId,
      timestamp,
    };

    logger.warn({ err, problem, requestId }, `HTTP exception: ${err.message}`);
    return new Response(JSON.stringify(problem), {
      status,
      headers: { "Content-Type": "application/problem+json; charset=utf-8" },
    });
  }

  // 3. Unhandled runtime exceptions (Zero internal stack trace leakage)
  logger.error(
    { err, stack: err.stack, requestId, path: instance },
    `Unhandled exception: ${err.message}`
  );
  Sentry.captureException(err, { extra: { requestId, path: instance } });

  const internalError = new InternalServerError(
    "An unexpected internal server error occurred. Please contact support with the requestId."
  );
  const safeProblem = { ...internalError.toProblemDetails(requestId), instance };

  return new Response(JSON.stringify(safeProblem), {
    status: 500,
    headers: { "Content-Type": "application/problem+json; charset=utf-8" },
  });
};
