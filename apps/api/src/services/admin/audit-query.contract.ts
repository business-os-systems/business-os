import { PLATFORM_ERROR_CODE } from "@suite/core";
import { ValidationError } from "@suite/core/errors";
import { z } from "zod";

export const DEFAULT_AUDIT_LIMIT = 50;
export const MAXIMUM_AUDIT_LIMIT = 100;
export const MAXIMUM_AUDIT_EXPORT_ROWS = 5000;
export const MINIMUM_PII_REASON_LENGTH = 5;
export const MAXIMUM_PII_REASON_LENGTH = 255;

const optionalIdSchema = z.string().trim().min(1).max(191).optional();
const optionalActionSchema = z.string().trim().min(1).max(64).optional();
const optionalInstantSchema = z.string().datetime().optional();

export const auditQuerySchema = z.object({
  organizationId: optionalIdSchema,
  actorOperatorId: optionalIdSchema,
  action: optionalActionSchema,
  from: optionalInstantSchema,
  to: optionalInstantSchema,
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(MAXIMUM_AUDIT_LIMIT).default(DEFAULT_AUDIT_LIMIT),
});

export const auditVerifyQuerySchema = z.object({
  organizationId: optionalIdSchema,
});

export const auditExportQuerySchema = auditQuerySchema.omit({
  cursor: true,
  limit: true,
});

export const auditItemSchema = z
  .object({
    id: z.string().min(1),
    occurredAt: z.string().datetime(),
    actorOperatorId: z.string().nullable(),
    action: z.string().min(1),
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    organizationId: z.string().nullable(),
    requestId: z.string().min(1),
    before: z.record(z.unknown()).nullable(),
    after: z.record(z.unknown()).nullable(),
    recordHash: z.string().min(1),
  })
  .strict();

export const auditPageSchema = z
  .object({
    items: z.array(auditItemSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const auditVerifyResultSchema = z
  .object({
    verified: z.boolean(),
    checkedCount: z.number().int().nonnegative(),
    firstBrokenId: z.string().nullable(),
  })
  .strict();

export const auditPiiHeaderSchema = z.object({
  "x-pii-reason": z
    .string()
    .trim()
    .min(MINIMUM_PII_REASON_LENGTH)
    .max(MAXIMUM_PII_REASON_LENGTH)
    .optional(),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type AuditVerifyQuery = z.infer<typeof auditVerifyQuerySchema>;
export type AuditExportQuery = z.infer<typeof auditExportQuerySchema>;
export type AuditItem = z.infer<typeof auditItemSchema>;
export type AuditPage = z.infer<typeof auditPageSchema>;
export type AuditVerifyResult = z.infer<typeof auditVerifyResultSchema>;

interface AuditCursor {
  /** The database timestamp with microsecond precision, in UTC ISO form. */
  readonly occurredAt: string;
  readonly id: string;
}

export function encodeAuditCursor(row: {
  readonly occurredAt: string;
  readonly id: string;
}): string {
  return Buffer.from(JSON.stringify({ occurredAt: row.occurredAt, id: row.id }), "utf8").toString(
    "base64url",
  );
}

const auditCursorSchema = z.object({
  occurredAt: z
    .string()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime())),
  id: z.string().min(1).max(64),
});

function invalidAuditCursor(cause?: unknown): never {
  throw new ValidationError("Invalid pagination cursor.", undefined, {
    code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
    ...(cause === undefined ? {} : { cause }),
  });
}

export function decodeAuditCursor(raw: string): AuditCursor {
  let parsed: unknown = undefined;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch (error) {
    invalidAuditCursor(error);
  }

  const result = auditCursorSchema.safeParse(parsed);
  if (!result.success) {
    invalidAuditCursor();
  }

  return result.data;
}
