import { z } from "@hono/zod-openapi";
import {
  FLAG_ENVIRONMENTS,
  FLAG_PAGE_LIMIT,
  FLAG_RULE_TYPES,
} from "@suite/flags/contracts";
import {
  createFlagBodySchema,
  flagRuleInputSchema,
  updateFlagBodySchema,
  type CreateFlagInput,
  type UpdateFlagInput,
} from "../../services/admin/flags.contract.js";

/** Platform flag boundary schemas (T064/T066/T173/T175). */

const flagEnvironmentSchema = z.enum(FLAG_ENVIRONMENTS);

/** PATCH params accept legacy keys; creation requires an app namespace. */
export const flagKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9_.-]+$/,
    "Flag key must be lowercase letters, digits, dots, underscores or hyphens."
  );

export const flagKeyParamSchema = z.object({ key: flagKeySchema });

export const listFlagsQuerySchema = z.object({
  environment: flagEnvironmentSchema.optional(),
  cursor: z.string().trim().max(256).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(FLAG_PAGE_LIMIT.max)
    .default(FLAG_PAGE_LIMIT.default),
});

export const flagEnvironmentQuerySchema = z.object({
  environment: flagEnvironmentSchema,
});

export { createFlagBodySchema, flagRuleInputSchema, updateFlagBodySchema };
export type { CreateFlagInput, UpdateFlagInput };

export const flagRuleSchema = z.object({
  id: z.string(),
  ruleType: z.enum(FLAG_RULE_TYPES),
  targetId: z.string(),
  enabled: z.boolean(),
  priority: z.number().int(),
});

export const flagSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  environment: flagEnvironmentSchema,
  isEnabled: z.boolean(),
  defaultEnabled: z.boolean(),
  version: z.number().int(),
  owner: z.string().nullable(),
  expiresAt: z.string().nullable(),
  removalTicket: z.string().nullable(),
  isExpired: z.boolean(),
  lifecycleComplete: z.boolean(),
  rules: z.array(flagRuleSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const flagPageSchema = z.object({
  items: z.array(flagSchema),
  nextCursor: z.string().nullable(),
});
