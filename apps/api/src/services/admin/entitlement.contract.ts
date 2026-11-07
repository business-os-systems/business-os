import { z } from "zod";
import { settingsFieldDefinitionSchema } from "@suite/core";

const MAX_APP_ID_LENGTH = 64;
const MAX_VERSION_TOKEN_LENGTH = 64;

export const tenantParamsSchema = z.object({
  orgId: z.string().trim().min(1).max(128),
});

export const appSettingsParamsSchema = tenantParamsSchema.extend({
  appId: z.string().trim().min(1).max(MAX_APP_ID_LENGTH),
});

export const branchOverrideSchema = z
  .object({
    branchId: z.string(),
    isEnabled: z.boolean(),
  })
  .strict();

const entitlementAppSchema = z
  .object({
    appId: z.string(),
    isEnabled: z.boolean(),
    installedAt: z.string(),
    version: z.string(),
    branchOverrides: z.array(branchOverrideSchema),
  })
  .strict();

export const entitlementListSchema = z
  .object({ apps: z.array(entitlementAppSchema) })
  .strict();

export const updateEntitlementBodySchema = z
  .object({
    appId: z.string().trim().min(1).max(MAX_APP_ID_LENGTH),
    enabled: z.boolean(),
    expectedVersion: z.string().trim().min(1).max(MAX_VERSION_TOKEN_LENGTH),
  })
  .strict();

const staleFieldSchema = z
  .object({
    name: z.string(),
    reason: z.string(),
  })
  .strict();

const appSettingsSchemaSchema = z
  .object({ fields: z.array(settingsFieldDefinitionSchema).readonly() })
  .strict();

export const appSettingsViewSchema = z
  .object({
    appId: z.string(),
    schema: appSettingsSchemaSchema,
    values: z.record(z.unknown()),
    staleFields: z.array(staleFieldSchema).readonly(),
    version: z.string(),
  })
  .strict();

export const appSettingsWriteResultSchema = z
  .object({
    appId: z.string(),
    values: z.record(z.unknown()),
    removedFields: z.array(z.string()).readonly(),
    staleFields: z.array(staleFieldSchema).readonly(),
    version: z.string(),
  })
  .strict();

export const updateAppSettingsBodySchema = z
  .object({
    values: z.record(z.unknown()),
    expectedVersion: z.string().trim().min(1).max(MAX_VERSION_TOKEN_LENGTH),
  })
  .strict();

export type TenantEntitlement = z.infer<typeof entitlementAppSchema>;
export type TenantEntitlementList = z.infer<typeof entitlementListSchema>;
export type AppSettingsView = z.infer<typeof appSettingsViewSchema>;
export type AppSettingsWriteResult = z.infer<
  typeof appSettingsWriteResultSchema
>;
