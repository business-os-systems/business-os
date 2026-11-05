import { z, type Hook } from "@hono/zod-openapi";
import type { Env } from "hono";
import { ValidationError } from "@suite/core/errors";
import { PLATFORM_ERROR_CODE, problemDetailsSchema } from "@suite/core";

/**
 * Every Platform router renders a schema failure as RFC 7807 problem details,
 * not Hono's bare 400 body. Domain routing stays identical across slices.
 */
export const platformValidationHook: Hook<unknown, Env, string, unknown> = (result) => {
  if (!result.success) {
    throw new ValidationError(
      "Invalid request parameters",
      result.error.errors.map((issue) => ({
        name: issue.path.join("."),
        reason: issue.message,
      })),
      { code: PLATFORM_ERROR_CODE.VALIDATION_FAILED }
    );
  }
};

/**
 * OpenAPI response shapes shared by the Platform admin routers. Keeping them in
 * one module stops each router from declaring its own envelope and error set.
 */
export const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.literal(true),
    data,
    requestId: z.string(),
    timestamp: z.string(),
  });

export const errorResponses = {
  401: {
    description: "Authentication required",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  403: {
    description: "Capability denied",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  404: {
    description: "Tenant not found",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  422: {
    description: "Invalid request",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
} as const;
