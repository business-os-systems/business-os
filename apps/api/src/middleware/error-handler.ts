import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import * as Sentry from "@sentry/node";
import { AppError, InternalServerError } from "@suite/core/errors";
import { logger, scrubStringValues } from "@suite/logger";
import {
  buildCorsResponseHeaders,
  resolvePlatformCorsOrigins,
  CORS_ALLOWED_ORIGINS_CONTEXT_KEY,
  CORS_ALLOW_CREDENTIALS_CONTEXT_KEY,
} from "./cors.js";

/**
 * Global RFC 7807 Problem Details Error Handler for Hono API.
 * Guarantees zero sensitive internal stack trace leakage on unhandled exceptions.
 */
export const globalErrorHandler: ErrorHandler = (err, c) => {
  const requestId = c.get("requestId");
  const instance = c.req.path;
  const timestamp = new Date().toISOString();
  const allowedOrigins =
    (c.get(CORS_ALLOWED_ORIGINS_CONTEXT_KEY) as string[] | undefined) ??
    resolvePlatformCorsOrigins();
  const allowCredentials =
    (c.get(CORS_ALLOW_CREDENTIALS_CONTEXT_KEY) as boolean | undefined) ?? true;
  const corsHeaders = buildCorsResponseHeaders(
    c.req.header("origin"),
    allowedOrigins,
    allowCredentials
  );

  // 1. Domain AppError hierarchy (@suite/core)
  if (err instanceof AppError) {
    const problem = { ...err.toProblemDetails(requestId), instance };

    // If client error (4xx), log at warn level; if server error (5xx), log at error level
    if (err.status >= 500) {
      const safeMessage = scrubStringValues(err.message);
      logger.error(
        {
          error: {
            name: err.name,
            message: safeMessage,
            stack: err.stack ? scrubStringValues(err.stack) : undefined,
          },
          problem: {
            ...problem,
            detail: scrubStringValues(problem.detail),
          },
          requestId,
          path: instance,
        },
        `Application error [${err.code}]: ${safeMessage}`
      );
      Sentry.captureException(new Error(safeMessage), {
        extra: {
          requestId,
          path: instance,
          code: err.code,
          stack: err.stack ? scrubStringValues(err.stack) : undefined,
        },
      });
    } else {
      logger.warn(
        { problem, requestId, path: instance },
        `Client error [${err.code}]: ${err.message}`
      );
    }

    return new Response(JSON.stringify(problem), {
      status: err.status,
      headers: {
        "Content-Type": "application/problem+json; charset=utf-8",
        ...corsHeaders,
      },
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

    const safeMessage = scrubStringValues(err.message);
    logger.warn(
      {
        error: {
          name: err.name,
          message: safeMessage,
          stack: err.stack ? scrubStringValues(err.stack) : undefined,
        },
        problem: {
          ...problem,
          detail: scrubStringValues(problem.detail),
        },
        requestId,
      },
      `HTTP exception: ${safeMessage}`
    );
    return new Response(JSON.stringify(problem), {
      status,
      headers: {
        "Content-Type": "application/problem+json; charset=utf-8",
        ...corsHeaders,
      },
    });
  }

  // 3. Unhandled runtime exceptions (Zero internal stack trace leakage)
  const safeMessage = scrubStringValues(err.message);
  const safeStack = err.stack ? scrubStringValues(err.stack) : undefined;
  logger.error(
    {
      error: { name: err.name, message: safeMessage, stack: safeStack },
      requestId,
      path: instance,
    },
    `Unhandled exception: ${safeMessage}`
  );
  Sentry.captureException(new Error(safeMessage), {
    extra: { requestId, path: instance, stack: safeStack },
  });

  const internalError = new InternalServerError(
    "An unexpected internal server error occurred. Please contact support with the requestId."
  );
  const safeProblem = { ...internalError.toProblemDetails(requestId), instance };

  return new Response(JSON.stringify(safeProblem), {
    status: 500,
    headers: {
      "Content-Type": "application/problem+json; charset=utf-8",
      ...corsHeaders,
    },
  });
};
