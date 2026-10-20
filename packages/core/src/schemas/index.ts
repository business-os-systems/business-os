import { z } from "zod";

/**
 * Common pagination query parameters for list endpoints.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().trim().optional(),
  sortBy: z.string().trim().optional(),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * Standard pagination metadata in API responses.
 */
export const paginationMetaSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasMore: z.boolean(),
  cursor: z.string().nullable().optional(),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

/**
 * Granular error detail within RFC 7807 responses.
 */
export const apiErrorDetailSchema = z.object({
  name: z.string(),
  reason: z.string(),
  code: z.string().optional(),
});

export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;

/**
 * RFC 7807 Problem Details response schema.
 */
export const problemDetailsSchema = z.object({
  type: z
    .string()
    .url()
    .or(z.string().regex(/^\/[a-zA-Z0-9_\-/]+$/, "Must be a valid relative error URI path")),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string(),
  code: z.string(),
  instance: z.string().optional(),
  invalidParams: z.array(apiErrorDetailSchema).optional(),
  requestId: z.string().optional(),
  timestamp: z.string().datetime(),
});

export type ProblemDetailsResponse = z.infer<typeof problemDetailsSchema>;

/**
 * Factory helper for type-safe API Success Envelope schemas.
 */
export function createSuccessResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: paginationMetaSchema.optional(),
    requestId: z.string(),
    timestamp: z.string().datetime(),
  });
}

/**
 * Supported Enterprise Single Sign-On (SSO) Identity Provider configurations.
 */
export const ssoProviderSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("google_workspace"),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    hostedDomain: z.string().optional(),
  }),
  z.object({
    provider: z.literal("microsoft_entra"),
    tenantId: z.string().min(1),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
  }),
  z.object({
    provider: z.literal("saml"),
    entryPoint: z.string().url(),
    issuer: z.string().min(1),
    cert: z.string().min(1),
  }),
  z.object({
    provider: z.literal("oidc"),
    issuer: z.string().url(),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
  }),
  z.object({
    provider: z.literal("internal_suite"),
  }),
]);

export type SsoProviderConfig = z.infer<typeof ssoProviderSchema>;

/**
 * Cryptographic SHA-256 Audit Event payload schema.
 */
export const auditEventPayloadSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().min(1),
  branchId: z.string().nullable().optional(),
  actorUserId: z.string().min(1),
  action: z.string().min(1),
  entityName: z.string().min(1),
  entityId: z.string().min(1),
  oldData: z.record(z.unknown()).nullable().optional(),
  newData: z.record(z.unknown()).nullable().optional(),
  prevHash: z.string().min(1),
  recordHash: z.string().regex(/^[a-f0-9]{64}$/i, "recordHash must be a 64-character SHA-256 hex string"),
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

export type AuditEventPayload = z.infer<typeof auditEventPayloadSchema>;

/**
 * Manager Override Token Request Schema (for privileged operations).
 */
export const managerOverrideRequestSchema = z.object({
  managerPin: z.string().regex(/^\d{4,8}$/, "Manager PIN must be between 4 and 8 digits"),
  action: z.string().min(1),
  entityId: z.string().min(1),
  branchId: z.string().min(1),
  reason: z.string().min(3, "A valid business justification is required for manager overrides"),
});

export type ManagerOverrideRequest = z.infer<typeof managerOverrideRequestSchema>;
