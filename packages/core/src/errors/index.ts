export interface InvalidParamDetail {
  readonly name: string;
  readonly reason: string;
  readonly code?: string;
}

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly instance?: string;
  readonly invalidParams?: readonly InvalidParamDetail[];
  readonly requestId?: string;
  readonly timestamp: string;
}

export interface AppErrorOptions {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string;
  readonly type?: string;
  readonly instance?: string;
  readonly invalidParams?: readonly InvalidParamDetail[];
  readonly cause?: unknown;
}

/**
 * Base Application Error adhering strictly to the IETF RFC 7807 Problem Details specification.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string;
  readonly type: string;
  readonly instance?: string;
  readonly invalidParams?: readonly InvalidParamDetail[];

  constructor(options: AppErrorOptions) {
    super(options.detail, { cause: options.cause });
    this.name = this.constructor.name;
    this.status = options.status;
    this.code = options.code;
    this.title = options.title;
    this.detail = options.detail;
    this.type =
      options.type ??
      (options.code ? `/errors/${options.code.toLowerCase().replace(/_/g, "-")}` : "/errors/app-error");
    this.instance = options.instance;
    this.invalidParams = options.invalidParams;

    // Maintain clean V8 stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serializes the error into a strictly compliant RFC 7807 JSON representation.
   */
  toProblemDetails(requestId?: string): ProblemDetails {
    const payload: ProblemDetails = {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
      code: this.code,
      timestamp: new Date().toISOString(),
      ...(this.instance ? { instance: this.instance } : {}),
      ...(this.invalidParams && this.invalidParams.length > 0
        ? { invalidParams: this.invalidParams }
        : {}),
      ...(requestId ? { requestId } : {}),
    };

    return payload;
  }
}

/**
 * 404 Not Found error
 */
export class NotFoundError extends AppError {
  constructor(detail = "The requested resource could not be found", options?: Partial<AppErrorOptions>) {
    super({
      status: 404,
      code: options?.code ?? "NOT_FOUND",
      title: options?.title ?? "Resource Not Found",
      detail,
      ...options,
    });
  }
}

/**
 * 401 Unauthorized error (Authentication missing or invalid)
 */
export class UnauthorizedError extends AppError {
  constructor(detail = "Authentication is required to access this resource", options?: Partial<AppErrorOptions>) {
    super({
      status: 401,
      code: options?.code ?? "UNAUTHORIZED",
      title: options?.title ?? "Unauthorized",
      detail,
      ...options,
    });
  }
}

/**
 * 403 Forbidden error (Authenticated, but insufficient permissions)
 */
export class ForbiddenError extends AppError {
  constructor(detail = "You do not have permission to perform this action", options?: Partial<AppErrorOptions>) {
    super({
      status: 403,
      code: options?.code ?? "FORBIDDEN",
      title: options?.title ?? "Forbidden",
      detail,
      ...options,
    });
  }
}

/**
 * 409 Conflict error (State conflict or concurrency race condition)
 */
export class ConflictError extends AppError {
  constructor(detail = "The operation could not be completed due to a resource conflict", options?: Partial<AppErrorOptions>) {
    super({
      status: 409,
      code: options?.code ?? "CONFLICT",
      title: options?.title ?? "Resource Conflict",
      detail,
      ...options,
    });
  }
}

/**
 * 422 Unprocessable Entity / Validation Error with granular invalid field details
 */
export class ValidationError extends AppError {
  constructor(
    detail = "The request payload failed schema validation",
    invalidParams?: readonly InvalidParamDetail[],
    options?: Partial<AppErrorOptions>
  ) {
    super({
      status: 422,
      code: options?.code ?? "VALIDATION_ERROR",
      title: options?.title ?? "Validation Failed",
      detail,
      invalidParams,
      ...options,
    });
  }
}

/**
 * 403 Tenant Mismatch Error (Attempt to cross tenant or organization boundaries)
 */
export class TenantMismatchError extends AppError {
  constructor(
    detail = "Access to the requested tenant or organization context is denied",
    options?: Partial<AppErrorOptions>
  ) {
    super({
      status: 403,
      code: options?.code ?? "TENANT_MISMATCH",
      title: options?.title ?? "Tenant Isolation Violation",
      detail,
      ...options,
    });
  }
}

/**
 * 429 Rate Limit Exceeded error
 */
export class RateLimitError extends AppError {
  readonly retryAfterSeconds?: number;

  constructor(
    detail = "Too many requests. Please slow down and retry later",
    retryAfterSeconds?: number,
    options?: Partial<AppErrorOptions>
  ) {
    super({
      status: 429,
      code: options?.code ?? "RATE_LIMIT_EXCEEDED",
      title: options?.title ?? "Too Many Requests",
      detail,
      ...options,
    });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * 500 Internal Server Error
 */
export class InternalServerError extends AppError {
  constructor(
    detail = "An internal server error occurred while processing the request",
    options?: Partial<AppErrorOptions>
  ) {
    super({
      status: 500,
      code: options?.code ?? "INTERNAL_SERVER_ERROR",
      title: options?.title ?? "Internal Server Error",
      detail,
      ...options,
    });
  }
}

/**
 * 503 Service Unavailable Error
 */
export class ServiceUnavailableError extends AppError {
  constructor(
    detail = "Service is temporarily unavailable due to dependency failure",
    options?: Partial<AppErrorOptions>
  ) {
    super({
      status: 503,
      code: options?.code ?? "SERVICE_UNAVAILABLE",
      title: options?.title ?? "Service Unavailable",
      detail,
      ...options,
    });
  }
}

/**
 * Type guard for AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export interface ProblemPayloadInput {
  status: number;
  code: string;
  title: string;
  detail: string;
  type?: string;
  instance?: string;
  invalidParams?: readonly InvalidParamDetail[];
  retryAfter?: number;
  extra?: Record<string, unknown>;
}

export interface ProblemEnvelope {
  body: Record<string, unknown>;
  init: {
    status: number;
    headers: Record<string, string>;
  };
}

/**
 * Canonical RFC 7807 problem details payload and headers builder.
 * Guarantees relative URI format (/errors/<slug>) and application/problem+json Content-Type.
 */
export function createProblemEnvelope(input: ProblemPayloadInput): ProblemEnvelope {
  const type =
    input.type ??
    (input.code ? `/errors/${input.code.toLowerCase().replace(/_/g, "-")}` : "/errors/app-error");

  const headers: Record<string, string> = {
    "Content-Type": "application/problem+json",
  };

  if (input.retryAfter !== undefined) {
    headers["Retry-After"] = String(input.retryAfter);
  }

  const body: Record<string, unknown> = {
    type,
    title: input.title,
    status: input.status,
    detail: input.detail,
    code: input.code,
    ...(input.retryAfter !== undefined ? { retryAfter: input.retryAfter } : {}),
    ...(input.instance ? { instance: input.instance } : {}),
    ...(input.invalidParams && input.invalidParams.length > 0 ? { invalidParams: input.invalidParams } : {}),
    ...input.extra,
  };

  return {
    body,
    init: {
      status: input.status,
      headers,
    },
  };
}

export interface SuccessEnvelope<T> {
  body: T;
  init: {
    status: number;
    headers: Record<string, string>;
  };
}

export interface SuccessPayloadInput<T> {
  data: T;
  status?: number;
  headers?: Record<string, string>;
}

/**
 * Canonical JSON success response envelope builder.
 * Guarantees standard application/json Content-Type and custom status / headers.
 */
export function createSuccessEnvelope<T>(input: SuccessPayloadInput<T>): SuccessEnvelope<T> {
  return {
    body: input.data,
    init: {
      status: input.status ?? 200,
      headers: {
        "Content-Type": "application/json",
        ...(input.headers ?? {}),
      },
    },
  };
}

export interface ZodErrorLike {
  issues: Array<{
    path: Array<string | number>;
    message: string;
  }>;
}

export interface ZodProblemOptions {
  title?: string;
  detail?: string;
  status?: number;
  code?: string;
  type?: string;
  instance?: string;
}

/**
 * Formats a Zod validation error into RFC 7807 invalidParams array.
 */
export function formatZodInvalidParams(error: ZodErrorLike): InvalidParamDetail[] {
  return error.issues.map((issue) => ({
    name: issue.path.join(".") || "body",
    reason: issue.message,
  }));
}

/**
 * Builds a standardized RFC 7807 problem details envelope from a Zod validation failure.
 */
export function createZodProblemEnvelope(
  error: ZodErrorLike,
  options: ZodProblemOptions = {}
): ProblemEnvelope {
  const invalidParams = formatZodInvalidParams(error);
  const detail =
    options.detail ??
    (error.issues[0]?.message || "Validation failed for request parameters");

  return createProblemEnvelope({
    status: options.status ?? 400,
    code: options.code ?? "VALIDATION_FAILED",
    title: options.title ?? "Bad Request",
    detail,
    type: options.type,
    instance: options.instance,
    invalidParams,
  });
}


