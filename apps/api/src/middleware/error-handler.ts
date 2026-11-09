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

interface ScrubbedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

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

function scrubError(error: Error): ScrubbedError {
  const message = scrubStringValues(error.message);
  if (error.stack === undefined) {
    return { name: error.name, message };
  }
  return { name: error.name, message, stack: scrubStringValues(error.stack) };
}

interface ServerExceptionCapture {
  readonly message: string;
  readonly extra: Record<string, unknown>;
}

function captureServerException(
  context: ErrorContext,
  capture: ServerExceptionCapture
): void {
  Sentry.captureException(new Error(capture.message), {
    extra: {
      requestId: context.requestId,
      path: context.instance,
      ...capture.extra,
    },
  });
}

interface AppErrorLog {
  readonly error: AppError;
  readonly problem: ProblemDetails;
  readonly context: ErrorContext;
}

function logServerAppError(input: AppErrorLog): void {
  const { error, problem, context } = input;
  const details = scrubError(error);
  logger.error(
    {
      error: details,
      problem: { ...problem, detail: scrubStringValues(problem.detail) },
      requestId: context.requestId,
      path: context.instance,
    },
    `Application error [${error.code}]: ${details.message}`
  );
  captureServerException(context, {
    message: details.message,
    extra: { code: error.code, stack: details.stack },
  });
}

function logClientAppError(input: AppErrorLog): void {
  const { error, problem, context } = input;
  logger.warn(
    { problem, requestId: context.requestId, path: context.instance },
    `Client error [${error.code}]: ${error.message}`
  );
}

function mapAppError(error: Error, context: ErrorContext): ErrorResponse | null {
  if (!(error instanceof AppError)) {
    return null;
  }

  const problem = {
    ...error.toProblemDetails(context.requestId),
    instance: context.instance,
  };

  if (error.status >= 500) {
    logServerAppError({ error, problem, context });
  } else {
    logClientAppError({ error, problem, context });
  }

  return { status: error.status, problem };
}

function httpExceptionPresentation(status: number) {
  return status >= 500
    ? HTTP_EXCEPTION_PRESENTATION.server
    : HTTP_EXCEPTION_PRESENTATION.client;
}

interface HttpExceptionLog {
  readonly error: HTTPException;
  readonly problem: ProblemDetails;
  readonly context: ErrorContext;
}

function logHttpException(input: HttpExceptionLog): void {
  const { error, problem, context } = input;
  const details = scrubError(error);
  logger.warn(
    {
      error: details,
      problem: { ...problem, detail: scrubStringValues(problem.detail) },
      requestId: context.requestId,
    },
    `HTTP exception: ${details.message}`
  );
}

function mapHttpException(
  error: Error,
  context: ErrorContext
): ErrorResponse | null {
  if (!(error instanceof HTTPException)) {
    return null;
  }

  const presentation = httpExceptionPresentation(error.status);
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

  logHttpException({ error, problem, context });
  return { status: error.status, problem };
}

function mapUnexpectedError(
  error: Error,
  context: ErrorContext
): ErrorResponse {
  const details = scrubError(error);
  logger.error(
    {
      error: details,
      requestId: context.requestId,
      path: context.instance,
    },
    `Unhandled exception: ${details.message}`
  );
  captureServerException(context, {
    message: details.message,
    extra: { stack: details.stack },
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
