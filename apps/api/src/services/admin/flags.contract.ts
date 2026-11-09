import { z } from "zod";
import {
  FLAG_ENVIRONMENTS,
  FLAG_RULE_TYPES,
} from "@suite/flags/contracts";

/**
 * Flag service inputs and their Zod schemas in one module. The HTTP boundary
 * consumes these schemas, the service consumes the inferred types, so the
 * contract can never drift from the validator (Constitution XVI, P10).
 */

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

export const createFlagBodySchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(
        /^[a-z0-9_.-]+$/,
        "Flag key must be lowercase letters, digits, dots, underscores or hyphens."
      )
      .refine(
        (value) => value.split(".").length >= 2,
        "Namespace the key as <app>.<feature>, for example pos.offline_mode."
      ),
    name: z.string().trim().min(1).max(128),
    description: z.string().trim().max(255).optional(),
    environment: z.enum(FLAG_ENVIRONMENTS),
    owner: z.string().trim().min(1).max(128),
    expiresAt: futureIsoDateSchema,
    removalTicket: removalTicketSchema,
  })
  .strict();

export const updateFlagBodySchema = z
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

export type FlagRuleInput = z.infer<typeof flagRuleInputSchema>;
export type CreateFlagInput = z.infer<typeof createFlagBodySchema>;
export type UpdateFlagInput = z.infer<typeof updateFlagBodySchema>;
