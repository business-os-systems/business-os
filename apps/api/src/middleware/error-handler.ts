import type { Context, ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import * as Sentry from "@sentry/node";
import type { ProblemDetails } from "@suite/core";
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
 *
 * Errors are mapped through a table of single-responsibility responders, so a
 * new error family is a new mapper rather than another branch in one function.
 */

interface ErrorContext {
  readonly requestId: string;
  readonly instance: string;
  readonly timestamp: string;
  readonly corsHeaders: Record<string, string>;
}

interface ErrorResponse {
  readonly status: number;
  readonly problem: ProblemDetails;
}

type ErrorMapper = (error: Error, context: ErrorContext) => ErrorResponse | null;

const HTTP_EXCEPTION_PRESENTATION = {
  client: {
    type: "/errors/http-exception",
    title: "Bad Request",
    code: "HTTP_EXCEPTION",
  },
  server: {
    type: "/errors/internal-server-error",
    title: "Internal Server Error",
    code: "INTERNAL_SERVER_ERROR",
  },
} as const;

function createErrorContext(c: Context): ErrorContext {
  const allowedOrigins =
    (c.get(CORS_ALLOWED_ORIGINS_CONTEXT_KEY) as string[] | undefined) ??
    resolvePlatformCorsOrigins();
  const allowCredentials =
    (c.get(CORS_ALLOW_CREDENTIALS_CONTEXT_KEY) as boolean | undefined) ?? true;

  return {
    requestId: c.get("requestId"),
    instance: c.req.path,
    timestamp: new Date().toISOString(),
    corsHeaders: buildCorsResponseHeaders(
      c.req.header("origin"),
      allowedOrigins,
      allowCredentials
    ),
  };
}

function mapAppError(
  error: Error,
  context: ErrorContext
): ErrorResponse | null {
  if (!(error instanceof AppError)) {
    return null;
  }

  const problem = {
    ...error.toProblemDetails(context.requestId),
    instance: context.instance,
  };

  if (error.status >= 500) {
    const safeMessage = scrubStringValues(error.message);
    logger.error(
      {
        error: {
          name: error.name,
          message: safeMessage,
          stack: error.stack ? scrubStringValues(error.stack) : undefined,
        },
        problem: {
          ...problem,
          detail: scrubStringValues(problem.detail),
        },
        requestId: context.requestId,
        path: context.instance,
      },
      `Application error [${error.code}]: ${safeMessage}`
    );
    Sentry.captureException(new Error(safeMessage), {
      extra: {
        requestId: context.requestId,
        path: context.instance,
        code: error.code,
        stack: error.stack ? scrubStringValues(error.stack) : undefined,
      },
    });
  } else {
    logger.warn(
      { problem, requestId: context.requestId, path: context.instance },
      `Client error [${error.code}]: ${error.message}`
    );
  }

  return { status: error.status, problem };
}

function mapHttpException(
  error: Error,
  context: ErrorContext
): ErrorResponse | null {
  if (!(error instanceof HTTPException)) {
    return null;
  }

  const presentation =
    error.status >= 500
      ? HTTP_EXCEPTION_PRESENTATION.server
      : HTTP_EXCEPTION_PRESENTATION.client;
  const problem: ProblemDetails = {
    type: presentation.type,
    title: presentation.title,
    status: error.status,
    detail: error.message,
    code: presentation.code,
    instance: context.instance,
    requestId: context.requestId,
    timestamp: context.timestamp,
  };

  const safeMessage = scrubStringValues(error.message);
  logger.warn(
    {
      error: {
        name: error.name,
        message: safeMessage,
        stack: error.stack ? scrubStringValues(error.stack) : undefined,
      },
      problem: {
        ...problem,
        detail: scrubStringValues(problem.detail),
      },
      requestId: context.requestId,
    },
    `HTTP exception: ${safeMessage}`
  );

  return { status: error.status, problem };
}

function mapUnexpectedError(
  error: Error,
  context: ErrorContext
): ErrorResponse {
  const safeMessage = scrubStringValues(error.message);
  const safeStack = error.stack ? scrubStringValues(error.stack) : undefined;
  logger.error(
    {
      error: { name: error.name, message: safeMessage, stack: safeStack },
      requestId: context.requestId,
      path: context.instance,
    },
    `Unhandled exception: ${safeMessage}`
  );
  Sentry.captureException(new Error(safeMessage), {
    extra: {
      requestId: context.requestId,
      path: context.instance,
      stack: safeStack,
    },
  });

  const internalError = new InternalServerError(
    "An unexpected internal server error occurred. Please contact support with the requestId."
  );
  return {
    status: 500,
    problem: {
      ...internalError.toProblemDetails(context.requestId),
      instance: context.instance,
    },
  };
}

const ERROR_MAPPERS: readonly ErrorMapper[] = [mapAppError, mapHttpException];

function writeProblemResponse(
  response: ErrorResponse,
  corsHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify(response.problem), {
    status: response.status,
    headers: {
      "Content-Type": "application/problem+json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

export const globalErrorHandler: ErrorHandler = (err, c) => {
  const context = createErrorContext(c);
  for (const mapper of ERROR_MAPPERS) {
    const mapped = mapper(err, context);
    if (mapped !== null) {
      return writeProblemResponse(mapped, context.corsHeaders);
    }
  }
  return writeProblemResponse(
    mapUnexpectedError(err, context),
    context.corsHeaders
  );
};
