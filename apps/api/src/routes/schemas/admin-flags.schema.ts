import { z } from "@hono/zod-openapi";

// ──────────────────────────────────────────────────────────
//  Request Params & Query
// ──────────────────────────────────────────────────────────

export const FlagKeyParamSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_.-]+$/, "Flag key must be lowercase alphanumeric with underscores, dots, or hyphens.")
    .openapi({ description: "Unique feature flag key", example: "new_dashboard_v2" }),
});

export const ListFlagsQuerySchema = z.object({
  environment: z
    .string()
    .min(1)
    .max(32)
    .optional()
    .openapi({ description: "Filter flags by environment (development | staging | production)", example: "development" }),
});

// ──────────────────────────────────────────────────────────
//  Request Bodies
// ──────────────────────────────────────────────────────────

export const CreateFlagBodySchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9_.-]+$/, "Flag key must be lowercase alphanumeric with underscores, dots, or hyphens.")
      .openapi({ description: "Immutable unique flag key", example: "new_dashboard_v2" }),
    name: z
      .string()
      .min(1)
      .max(128)
      .openapi({ description: "Human-readable flag name", example: "New Dashboard v2" }),
    description: z
      .string()
      .max(255)
      .optional()
      .openapi({ description: "Optional flag description", example: "Enables the redesigned dashboard layout" }),
    environment: z
      .string()
      .min(1)
      .max(32)
      .optional()
      .default("development")
      .openapi({ description: "Target environment", example: "development" }),
    isEnabled: z
      .boolean()
      .optional()
      .default(true)
      .openapi({ description: "Global master switch — if false the flag is fully killed", example: true }),
    defaultEnabled: z
      .boolean()
      .optional()
      .default(false)
      .openapi({ description: "Default evaluation fallback when no rule matches", example: false }),
    metadata: z
      .record(z.unknown())
      .optional()
      .openapi({ description: "Optional arbitrary JSON configuration payload", example: {} }),
  })
  .openapi("CreateFlagBody");

export const UpdateFlagBodySchema = z
  .object({
    expectedVersion: z
      .number()
      .int()
      .min(1)
      .openapi({ description: "Optimistic concurrency version number — must match current DB version", example: 1 }),
    isEnabled: z
      .boolean()
      .optional()
      .openapi({ description: "Update global master switch state", example: false }),
    defaultEnabled: z
      .boolean()
      .optional()
      .openapi({ description: "Update default evaluation fallback", example: true }),
    description: z
      .string()
      .max(255)
      .optional()
      .openapi({ description: "Update flag description", example: "Updated description" }),
    reason: z
      .string()
      .max(255)
      .optional()
      .openapi({ description: "Audit trail reason for this mutation", example: "Rolled back due to increased error rate" }),
  })
  .openapi("UpdateFlagBody");

// ──────────────────────────────────────────────────────────
//  Response Shapes
// ──────────────────────────────────────────────────────────

export const FlagResponseSchema = z
  .object({
    id: z.string().openapi({ description: "CUID flag identifier", example: "clxyz1234" }),
    key: z.string().openapi({ description: "Unique flag key", example: "new_dashboard_v2" }),
    name: z.string().openapi({ description: "Human-readable flag name", example: "New Dashboard v2" }),
    description: z.string().nullable().openapi({ description: "Flag description", example: "Enables the redesigned dashboard layout" }),
    environment: z.string().openapi({ description: "Target environment", example: "development" }),
    isEnabled: z.boolean().openapi({ description: "Global master switch state", example: true }),
    defaultEnabled: z.boolean().openapi({ description: "Default evaluation fallback", example: false }),
    version: z.number().int().openapi({ description: "Optimistic concurrency version", example: 1 }),
    metadata: z.record(z.unknown()).nullable().openapi({ description: "JSON configuration payload", example: {} }),
    createdAt: z.string().openapi({ description: "ISO 8601 creation timestamp", example: "2026-10-22T12:00:00.000Z" }),
    updatedAt: z.string().openapi({ description: "ISO 8601 last updated timestamp", example: "2026-10-22T12:00:00.000Z" }),
  })
  .openapi("FlagResponse");

export const ListFlagsResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.array(FlagResponseSchema),
    meta: z.object({
      total: z.number().int().openapi({ example: 12 }),
      environment: z.string().openapi({ example: "development" }),
    }),
    requestId: z.string().openapi({ example: "req_abc123" }),
    timestamp: z.string().openapi({ example: "2026-10-22T12:00:00.000Z" }),
  })
  .openapi("ListFlagsResponse");

export const SingleFlagResponseSchema = z
  .object({
    success: z.literal(true),
    data: FlagResponseSchema,
    requestId: z.string().openapi({ example: "req_abc123" }),
    timestamp: z.string().openapi({ example: "2026-10-22T12:00:00.000Z" }),
  })
  .openapi("SingleFlagResponse");
