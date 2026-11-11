import { z } from "zod";
import { PLATFORM_ERROR_CODE, problemDetailsSchema } from "@suite/core";
import { ValidationError } from "@suite/core/errors";
import { CMS_IDEMPOTENCY_KEY_PATTERN } from "../../services/cms/contract.js";

export { platformValidationHook as cmsValidationHook } from "../admin/openapi-shared.js";

export const CMS_JSON_CONTENT = "application/json" as const;
export const CMS_PROBLEM_CONTENT = "application/problem+json" as const;

/** Cursor list envelope shared by every CMS list route. */
export const cmsEnvelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.literal(true),
    data,
    requestId: z.string(),
    timestamp: z.string(),
  });

export const cmsErrorResponses = {
  401: {
    description: "Authentication required",
    content: { [CMS_PROBLEM_CONTENT]: { schema: problemDetailsSchema } },
  },
  403: {
    description: "Capability denied",
    content: { [CMS_PROBLEM_CONTENT]: { schema: problemDetailsSchema } },
  },
  404: {
    description: "Not found in this workspace",
    content: { [CMS_PROBLEM_CONTENT]: { schema: problemDetailsSchema } },
  },
  409: {
    description: "State conflict",
    content: { [CMS_PROBLEM_CONTENT]: { schema: problemDetailsSchema } },
  },
  422: {
    description: "Invalid request",
    content: { [CMS_PROBLEM_CONTENT]: { schema: problemDetailsSchema } },
  },
} as const;

export function readCmsRequestId(c: { get: (key: string) => unknown }): string {
  const value: unknown = c.get("requestId");
  return typeof value === "string" ? value : "unknown";
}

const IDEMPOTENCY_HEADER = "Idempotency-Key";

/**
 * Validates a replay key for any idempotent mutation (CT-4). Both the CMS
 * administration routes and the public inquiry intake call this one parser.
 */
export function parseIdempotencyKey(raw: string | undefined): string {
  const key = raw?.trim() ?? "";
  if (key.length === 0) {
    throw new ValidationError(
      "The Idempotency-Key header is required for this operation.",
      [{ name: IDEMPOTENCY_HEADER, reason: "Header is required" }],
      { code: PLATFORM_ERROR_CODE.IDEMPOTENCY_KEY_REQUIRED }
    );
  }
  if (!CMS_IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new ValidationError(
      "The Idempotency-Key header is malformed.",
      [{ name: IDEMPOTENCY_HEADER, reason: "Use 8 to 128 letters, digits, dot, colon, underscore or hyphen." }],
      { code: PLATFORM_ERROR_CODE.IDEMPOTENCY_KEY_REQUIRED }
    );
  }
  return key;
}

/** Create-from-template is replayable, so the request id is mandatory (CT-4). */
export function readIdempotencyKey(c: {
  req: { header: (name: string) => string | undefined };
}): string {
  return parseIdempotencyKey(c.req.header(IDEMPOTENCY_HEADER));
}
