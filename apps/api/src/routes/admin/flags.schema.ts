import { z } from "@hono/zod-openapi";
import {
  FLAG_ENVIRONMENTS,
  FLAG_PAGE_LIMIT,
  FLAG_RULE_TYPES,
} from "@suite/flags/contracts";
import type {
  CreateFlagInput,
  UpdateFlagInput,
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

export const newFlagKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)+$/,
    "Namespace the key as <app>.<feature>, for example pos.offline_mode."
  );

const futureIsoDateSchema = z
  .string()
  .datetime()
  .refine(
    (value) => Date.parse(value) > Date.now(),
    "Expiry must be a future ISO 8601 timestamp."
  );

const removalTicketSchema = z
  .string()
  .trim()
  .max(128)
  .regex(/^#\d+$/, "Removal ticket must be an issue reference such as #224.");

export const flagRuleInputSchema = z
  .object({
    ruleType: z.enum(FLAG_RULE_TYPES),
    targetId: z.string().trim().min(1).max(128),
    enabled: z.boolean(),
    priority: z.number().int().min(0).max(1000),
  })
  .strict();

export const flagRuleSchema = z.object({
  id: z.string(),
  ruleType: z.string(),
  targetId: z.string(),
  enabled: z.boolean(),
  priority: z.number().int(),
});

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

export const createFlagBodySchema: z.ZodType<CreateFlagInput> = z
  .object({
    key: newFlagKeySchema,
    name: z.string().trim().min(1).max(128),
    description: z.string().trim().max(255).optional(),
    environment: flagEnvironmentSchema,
    owner: z.string().trim().min(1).max(128),
    expiresAt: futureIsoDateSchema,
    removalTicket: removalTicketSchema,
  })
  .strict();

export const updateFlagBodySchema: z.ZodType<UpdateFlagInput> = z
  .object({
    expectedVersion: z.number().int().min(1),
    isEnabled: z.boolean().optional(),
    defaultEnabled: z.boolean().optional(),
    description: z.string().trim().max(255).optional(),
    owner: z.string().trim().min(1).max(128).optional(),
    expiresAt: futureIsoDateSchema.optional(),
    removalTicket: removalTicketSchema.optional(),
    rules: z.array(flagRuleInputSchema).max(50).optional(),
    reason: z.string().trim().min(3).max(255).optional(),
  })
  .strict()
  .superRefine((body, context) => {
    if (body.rules === undefined) {
      return;
    }
    const seen = new Set<string>();
    for (const rule of body.rules) {
      const identity = `${rule.ruleType}:${rule.targetId}`;
      if (seen.has(identity)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rules"],
          message: "A flag may target each rule type and target id only once.",
        });
        return;
      }
      seen.add(identity);
    }
  });

export type { CreateFlagInput, UpdateFlagInput };

export const flagSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  environment: z.string(),
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
