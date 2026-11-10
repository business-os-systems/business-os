import { z } from "zod";
import {
  settingsFieldDefinitionSchema,
  settingsValueSourceSchema,
} from "@suite/core";

const MAX_APP_ID_LENGTH = 64;
const MAX_VERSION_TOKEN_LENGTH = 64;

export const appSettingsDefaultsParamsSchema = z.object({
  appId: z.string().trim().min(1).max(MAX_APP_ID_LENGTH),
});

const staleFieldSchema = z
  .object({
    name: z.string(),
    reason: z.string(),
  })
  .strict();

const appSettingsSchemaSchema = z
  .object({ fields: z.array(settingsFieldDefinitionSchema).readonly() })
  .strict();

export const appSettingsDefaultsViewSchema = z
  .object({
    appId: z.string(),
    schema: appSettingsSchemaSchema,
    values: z.record(z.unknown()),
    effectiveValues: z.record(z.unknown()),
    sources: z.record(settingsValueSourceSchema),
    staleFields: z.array(staleFieldSchema).readonly(),
    version: z.string(),
  })
  .strict();

export const appSettingsDefaultsWriteResultSchema =
  appSettingsDefaultsViewSchema.extend({
    removedFields: z.array(z.string()).readonly(),
  });

export const updateAppSettingsDefaultsBodySchema = z
  .object({
    values: z.record(z.unknown()),
    expectedVersion: z.string().trim().min(1).max(MAX_VERSION_TOKEN_LENGTH),
  })
  .strict();

export type AppSettingsDefaultsView = z.infer<
  typeof appSettingsDefaultsViewSchema
>;
export type AppSettingsDefaultsWriteResult = z.infer<
  typeof appSettingsDefaultsWriteResultSchema
>;
