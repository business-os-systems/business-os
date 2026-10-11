import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { FormService } from "../services/form-service.js";

const ProblemDetailsSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
});

const FormSubmissionBodySchema = z.object({
  payload: z.record(z.unknown()),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().url(),
        size: z.number().int(),
      })
    )
    .optional(),
  turnstileToken: z.string().optional(),
  honeypot: z.string().optional(),
});

const FormSubmissionResponseSchema = z.object({
  success: z.boolean(),
  submissionId: z.string(),
  isDuplicate: z.boolean(),
  createdAt: z.string().optional(),
});

const UploadIntentBodySchema = z.object({
  fileName: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  mimeType: z.string().min(1),
});

const UploadIntentResponseSchema = z.object({
  uploadUrl: z.string().url(),
  storageKey: z.string(),
  maxSizeBytes: z.number().int(),
});

/**
 * Route: POST /api/v1/storefront/forms/:siteId/:blockId/submit
 */
export const submitFormRoute = createRoute({
  method: "post",
  path: "/:siteId/:blockId/submit",
  summary: "Ingest Public Storefront Form Submission",
  description:
    "Secure public form ingestion with honeypot bot trap, Cloudflare Turnstile token validation, and two-tier idempotency.",
  request: {
    params: z.object({
      siteId: z.string().min(1),
      blockId: z.string().min(1),
    }),
    headers: z.object({
      "x-idempotency-key": z.string().uuid(),
    }),
    body: {
      content: {
        "application/json": {
          schema: FormSubmissionBodySchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Form submission ingested successfully",
      content: {
        "application/json": {
          schema: FormSubmissionResponseSchema,
        },
      },
    },
    400: {
      description: "Validation failure, bot detection or invalid captcha",
      content: {
        "application/problem+json": {
          schema: ProblemDetailsSchema,
        },
      },
    },
    413: {
      description: "Payload too large (> 64KB)",
      content: {
        "application/problem+json": {
          schema: ProblemDetailsSchema,
        },
      },
    },
  },
});

/**
 * Route: POST /api/v1/storefront/forms/:siteId/upload-intent
 */
export const createUploadIntentRoute = createRoute({
  method: "post",
  path: "/:siteId/upload-intent",
  summary: "Generate Quarantined Attachment Upload Intent",
  description:
    "Generates a presigned Cloudflare R2 upload URL for form attachments (max 10MB per file).",
  request: {
    params: z.object({
      siteId: z.string().min(1),
    }),
    body: {
      content: {
        "application/json": {
          schema: UploadIntentBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Upload intent generated successfully",
      content: {
        "application/json": {
          schema: UploadIntentResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid file specifications or file exceeds 10MB",
      content: {
        "application/problem+json": {
          schema: ProblemDetailsSchema,
        },
      },
    },
  },
});

export function createFormRouter(
  formService: FormService = new FormService()
): OpenAPIHono {
  const router = new OpenAPIHono();

  // POST /:siteId/:blockId/submit
  router.openapi(submitFormRoute, async (c) => {
    const { siteId, blockId } = c.req.valid("param");
    const { "x-idempotency-key": idempotencyKey } = c.req.valid("header");
    const body = c.req.valid("json");

    const result = await formService.submitForm({
      siteId,
      blockId,
      idempotencyKey,
      payload: body.payload,
      attachments: body.attachments,
      turnstileToken: body.turnstileToken,
      honeypot: body.honeypot,
    });

    if (!result.success) {
      const status = result.errorCode === "PAYLOAD_TOO_LARGE" ? 413 : 400;
      return c.json(
        {
          type: `https://errors.business-os.com/cms/${result.errorCode.toLowerCase()}`,
          title: "Form Submission Rejected",
          status,
          detail: result.message,
          instance: c.req.path,
        },
        status
      );
    }

    return c.json(
      {
        success: true,
        submissionId: result.submissionId,
        isDuplicate: result.isDuplicate,
        createdAt: result.createdAt,
      },
      201
    );
  });

  // POST /:siteId/upload-intent
  router.openapi(createUploadIntentRoute, async (c) => {
    const { siteId } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      const intent = await formService.createUploadIntent({
        siteId,
        fileName: body.fileName,
        fileSizeBytes: body.fileSizeBytes,
        mimeType: body.mimeType,
      });

      return c.json(intent, 200);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create upload intent";
      return c.json(
        {
          type: "https://errors.business-os.com/cms/upload-intent-error",
          title: "Upload Intent Error",
          status: 400,
          detail: message,
          instance: c.req.path,
        },
        400
      );
    }
  });

  return router;
}
