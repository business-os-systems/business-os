import { z } from "@hono/zod-openapi";
import { problemDetailsSchema } from "@suite/core";

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
