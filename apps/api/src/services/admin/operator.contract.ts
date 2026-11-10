import { z } from "zod";

export const DEFAULT_INVITATION_TTL_HOURS = 24;
export const MIN_INVITATION_TTL_HOURS = 1;
export const MAX_INVITATION_TTL_HOURS = 168;
export const MAX_OPERATOR_PAGE_SIZE = 100;
const MAX_OPERATOR_CAPABILITIES_PER_INVITATION = 32;

export const OPERATOR_STATUS = {
  INVITED: "INVITED",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  REVOKED: "REVOKED",
} as const;

const OPERATOR_STATUSES = [
  OPERATOR_STATUS.INVITED,
  OPERATOR_STATUS.ACTIVE,
  OPERATOR_STATUS.SUSPENDED,
  OPERATOR_STATUS.REVOKED,
] as const;

const operatorStatusSchema = z.enum(OPERATOR_STATUSES);

export const operatorSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  status: operatorStatusSchema,
  mfaEnrolled: z.boolean(),
  lastSeenAt: z.string().nullable(),
  capabilities: z.array(z.string()),
});

export const operatorPageSchema = z.object({
  items: z.array(operatorSchema),
  nextCursor: z.string().nullable(),
});

export const createdOperatorSchema = z.object({
  operator: operatorSchema,
  admissionPending: z.literal(true),
  invitationExpiresAt: z.string(),
  invitationToken: z.string().nullable(),
});

export const createOperatorBodySchema = z
  .object({
    email: z.string().trim().email().max(191).toLowerCase(),
    displayName: z.string().trim().min(1).max(100),
    capabilities: z
      .array(z.string().trim().min(1).max(64))
      .max(MAX_OPERATOR_CAPABILITIES_PER_INVITATION),
    invitationTtlHours: z
      .number()
      .int()
      .min(MIN_INVITATION_TTL_HOURS)
      .max(MAX_INVITATION_TTL_HOURS)
      .optional(),
  })
  .strict();

export type OperatorSummary = z.infer<typeof operatorSchema>;
export type OperatorPage = z.infer<typeof operatorPageSchema>;
export type CreatedOperator = z.infer<typeof createdOperatorSchema>;

export type CreateOperatorInput = z.infer<typeof createOperatorBodySchema>;
const OPERATOR_REASON_MIN_LENGTH = 5;
const OPERATOR_REASON_MAX_LENGTH = 255;
export const MAX_OPERATOR_SESSION_PAGE_SIZE = 100;

const OPERATOR_GOVERNANCE_STATUSES = [
  OPERATOR_STATUS.ACTIVE,
  OPERATOR_STATUS.SUSPENDED,
  OPERATOR_STATUS.REVOKED,
] as const;

export type OperatorGovernanceStatus =
  (typeof OPERATOR_GOVERNANCE_STATUSES)[number];

export const updateOperatorStatusBodySchema = z
  .object({
    status: z.enum(OPERATOR_GOVERNANCE_STATUSES),
    expectedStatus: operatorStatusSchema,
    reason: z
      .string()
      .trim()
      .min(OPERATOR_REASON_MIN_LENGTH)
      .max(OPERATOR_REASON_MAX_LENGTH),
  })
  .strict();

export const changeCapabilitiesBodySchema = z
  .object({
    grant: z
      .array(z.string().trim().min(1).max(64))
      .max(MAX_OPERATOR_CAPABILITIES_PER_INVITATION)
      .default([]),
    revoke: z
      .array(z.string().trim().min(1).max(64))
      .max(MAX_OPERATOR_CAPABILITIES_PER_INVITATION)
      .default([]),
  })
  .strict();

export const capabilitySetSchema = z.object({
  capabilities: z.array(z.string()),
});

export const operatorIdParamsSchema = z.object({
  operatorId: z.string().trim().min(1).max(128),
});

export const operatorSessionParamsSchema = operatorIdParamsSchema.extend({
  sessionId: z.string().trim().min(1).max(128),
});

const operatorSessionSchema = z.object({
  id: z.string(),
  issuedAt: z.string(),
  expiresAt: z.string(),
  idleExpiresAt: z.string(),
  revokedAt: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
});

export const operatorSessionPageSchema = z.object({
  items: z.array(operatorSessionSchema),
  nextCursor: z.string().nullable(),
});

export const enrolmentStartBodySchema = z
  .object({ token: z.string().trim().min(32).max(512) })
  .strict();

export const enrolmentVerifyBodySchema = z
  .object({
    token: z.string().trim().min(32).max(512),
    flowId: z.string().trim().min(1).max(128),
    response: z.unknown(),
  })
  .strict();

export const enrolmentOptionsSchema = z.object({
  flowId: z.string(),
  options: z.record(z.unknown()),
  email: z.string(),
});

export const enrolledOperatorSchema = z.object({
  id: z.string(),
  email: z.string(),
  status: z.literal("ACTIVE"),
  mfaEnrolled: z.literal(true),
});

/**
 * The raw add-passkey token is returned once. An idempotent replay stores the
 * redacted form, so the one-time secret is never kept in the replay cache.
 */
export const enrolmentTokenResponseSchema = z.object({
  token: z.string().nullable(),
  expiresAt: z.string(),
});

export type EnrolledOperator = z.infer<typeof enrolledOperatorSchema>;

export interface OperatorActor {
  readonly operatorId: string;
  readonly requestId: string;
}

export type UpdateOperatorStatusInput = z.infer<
  typeof updateOperatorStatusBodySchema
> & {
  readonly operatorId: string;
  readonly actor: OperatorActor;
};

export type ChangeOperatorCapabilitiesInput = z.infer<
  typeof changeCapabilitiesBodySchema
> & {
  readonly operatorId: string;
  readonly actor: OperatorActor;
  /** Single-use confirmation token, consumed before the change is applied. */
  readonly stepUpToken: string | null;
};

export type OperatorSessionSummary = z.infer<typeof operatorSessionSchema>;
export type OperatorSessionPage = z.infer<typeof operatorSessionPageSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactDataField(body: string, field: string): string {
  if (body.trim() === "") {
    return body;
  }
  const parsed: unknown = JSON.parse(body);
  if (!isRecord(parsed) || !isRecord(parsed.data)) {
    return body;
  }
  if (!(field in parsed.data)) {
    return body;
  }
  return JSON.stringify({
    ...parsed,
    data: { ...parsed.data, [field]: null },
  });
}

/**
 * A once-only secret must not survive in the idempotency replay cache. The
 * stored copy keeps the rest of the response so a retry still sees the
 * operator but cannot mint or re-serve the raw token.
 */
export function redactCreatedOperatorToken(body: string): string {
  return redactDataField(body, "invitationToken");
}

export function redactEnrolmentTokenResponse(body: string): string {
  return redactDataField(body, "token");
}
