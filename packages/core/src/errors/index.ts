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
    this.type = options.type ?? "about:blank";
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
 * Type guard for AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
