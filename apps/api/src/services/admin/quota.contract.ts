import { z } from "zod";
import { MAX_QUOTA_LIMIT, QUOTA_KEY_CODES } from "@suite/core";

// Shape only. Registry membership is a service rule so an unknown key returns
// the documented 422 UNKNOWN_RESOURCE_KEY instead of a generic schema failure.
const quotaKeySchema = z.string().trim().min(1).max(64);

const limitValueSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Use a non-negative integer.")
  .max(MAX_QUOTA_LIMIT.toString().length, {
    message: "Value exceeds a signed 64-bit integer.",
  })
  .refine((value) => BigInt(value) <= MAX_QUOTA_LIMIT, {
    message: "Value exceeds a signed 64-bit integer.",
  });

// The one opaque concurrency token: a UTC microsecond timestamp. SQL trims the
// submitted value, so the contract does not re-implement that normalisation.
const quotaVersionSchema = z.string().min(1).max(64);

const quotaUnitSchema = z.enum(["count", "bytes"]).nullable();

export const quotaItemSchema = z
  .object({
    resourceKey: z.string().min(1).max(64),
    limitValue: z.string().regex(/^\d+$/),
    unit: quotaUnitSchema,
    currentValue: z.string().regex(/^\d+$/).nullable(),
    isMeasurable: z.boolean(),
    asOf: z.string().datetime(),
    isEnforced: z.boolean(),
    version: quotaVersionSchema,
  })
  .strict();

export const quotaListSchema = z
  .object({ items: z.array(quotaItemSchema) })
  .strict();

export const updateQuotaItemSchema = z
  .object({
    resourceKey: quotaKeySchema,
    limitValue: limitValueSchema,
    isEnforced: z.boolean(),
    expectedVersion: quotaVersionSchema.nullable(),
  })
  .strict();

export const updateQuotasBodySchema = z
  .object({
    items: z
      .array(updateQuotaItemSchema)
      .min(1)
      .max(QUOTA_KEY_CODES.length)
      .refine(
        (items) =>
          new Set(items.map((item) => item.resourceKey)).size === items.length,
        { message: "Duplicate resource key." }
      ),
  })
  .strict();

export const tenantParamsSchema = z.object({
  orgId: z.string().trim().min(1).max(128),
});

export type QuotaItem = z.infer<typeof quotaItemSchema>;
export type QuotaList = z.infer<typeof quotaListSchema>;
export type UpdateQuotaItem = z.infer<typeof updateQuotaItemSchema>;
export type UpdateQuotasBody = z.infer<typeof updateQuotasBodySchema>;
