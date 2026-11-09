import type { Context } from "hono";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { VerifyEmailResult } from "@suite/auth";
import {
  confirmEmailVerification,
  requestEmailVerification,
  type EmailVerificationRequestResult,
} from "../../services/auth/email-verification.service.js";
import {
  problemDetailsResponseSchema,
  readOptionalSessionToken,
} from "./shared.js";

const requestVerifyEmailRoute = createRoute({
  method: "post",
  path: "/verify-email/request",
  tags: ["Identity, Sessions & Auth"],
  summary: "Resend email verification link",
  description: "Dispatches a new 24h cryptographic token to the user's email address.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            email: z.string().email().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            alreadyVerified: z.boolean().optional(),
          }),
        },
      },
      description: "Verification link dispatched",
    },
    400: {
      content: {
        "application/problem+json": {
          schema: problemDetailsResponseSchema,
        },
      },
      description: "Validation error or missing email",
    },
    429: {
      content: {
        "application/problem+json": {
          schema: problemDetailsResponseSchema,
        },
      },
      description: "Rate limit exceeded (max 5 requests per hour)",
    },
  },
});

const confirmVerifyEmailRoute = createRoute({
  method: "post",
  path: "/verify-email/confirm",
  tags: ["Identity, Sessions & Auth"],
  summary: "Confirm email verification with cryptographic token",
  description: "Validates submitted token and marks User.emailVerified = true.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            token: z.string().min(1),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            email: z.string().optional(),
          }),
        },
      },
      description: "Email verified successfully",
    },
    400: {
      content: {
        "application/problem+json": {
          schema: problemDetailsResponseSchema,
        },
      },
      description: "Invalid or consumed verification token",
    },
    410: {
      content: {
        "application/problem+json": {
          schema: problemDetailsResponseSchema,
        },
      },
      description: "Verification token expired",
    },
  },
});

const MISSING_EMAIL_PROBLEM = {
  type: "/errors/validation-failed",
  title: "Bad Request",
  status: 400,
  detail: "Email address is required to dispatch verification link.",
  code: "VALIDATION_FAILED",
} as const;

const RATE_LIMITED_PROBLEM = {
  type: "/errors/rate-limit-exceeded",
  title: "Too Many Requests",
  status: 429,
  detail: "Rate limit exceeded. Maximum 5 verification emails allowed per hour.",
  code: "RATE_LIMIT_EXCEEDED",
} as const;

const EXPIRED_TOKEN_PROBLEM = {
  type: "/errors/token-expired",
  title: "Verification Token Expired",
  status: 410,
  detail: "The verification link has expired after 24 hours. Please request a new one.",
  code: "TOKEN_EXPIRED",
} as const;

const INVALID_TOKEN_PROBLEM = {
  type: "/errors/invalid-token",
  title: "Invalid Verification Token",
  status: 400,
  detail: "The verification token is invalid or has already been used.",
  code: "INVALID_TOKEN",
} as const;

function verificationRequestResponse(
  c: Context,
  result: EmailVerificationRequestResult
) {
  if (result.status === "invalid-request") {
    return c.json(MISSING_EMAIL_PROBLEM, 400);
  }
  if (result.status === "rate-limited") {
    return c.json(RATE_LIMITED_PROBLEM, 429);
  }
  if (result.status === "accepted") {
    return c.json(
      {
        success: true,
        message: "If an account exists with this email, a verification link has been dispatched.",
      },
      200
    );
  }
  if (result.status === "already-verified") {
    return c.json(
      { success: true, message: "Email is already verified.", alreadyVerified: true },
      200
    );
  }
  return c.json({ success: true, message: "Verification link dispatched" }, 200);
}

function verificationConfirmResponse(c: Context, result: VerifyEmailResult) {
  if (result.success) {
    return c.json(
      {
        success: true,
        message: "Email verified successfully",
        email: result.email,
      },
      200
    );
  }
  if (result.reason === "EXPIRED") {
    return c.json(EXPIRED_TOKEN_PROBLEM, 410);
  }
  return c.json(INVALID_TOKEN_PROBLEM, 400);
}

export function registerEmailVerificationRoutes(router: OpenAPIHono): void {
  router.openapi(requestVerifyEmailRoute, async (c) => {
    const result = await requestEmailVerification({
      sessionToken: readOptionalSessionToken(c),
      email: c.req.valid("json").email,
    });
    return verificationRequestResponse(c, result);
  });

  router.openapi(confirmVerifyEmailRoute, async (c) => {
    const { token } = c.req.valid("json");
    const result = await confirmEmailVerification(token);
    return verificationConfirmResponse(c, result);
  });
}
