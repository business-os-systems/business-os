import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  RateLimitError,
} from "@suite/core/errors";

export {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  RateLimitError,
};

export const AUTH_ERROR_CODES = {
  AUTH_UNAUTHORIZED: "AUTH_UNAUTHORIZED",
  PIN_INVALID: "PIN_INVALID",
  AUTH_PIN_LOCKED: "AUTH_PIN_LOCKED",
  BRANCH_ACCESS_DENIED: "BRANCH_ACCESS_DENIED",
  BRANCH_NOT_FOUND: "BRANCH_NOT_FOUND",
  TENANT_ACCESS_DENIED: "TENANT_ACCESS_DENIED",
  TENANT_MISMATCH: "TENANT_MISMATCH",
  OVERRIDE_TOKEN_INVALID: "OVERRIDE_TOKEN_INVALID",
  OVERRIDE_TOKEN_EXPIRED: "OVERRIDE_TOKEN_EXPIRED",
  SSO_PROVIDER_NOT_FOUND: "SSO_PROVIDER_NOT_FOUND",
} as const;
