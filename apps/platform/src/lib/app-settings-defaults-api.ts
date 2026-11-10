import { z } from "zod";
import {
  settingsFieldDefinitionSchema,
  settingsValueSourceSchema,
  type SettingsFieldDefinition,
} from "@suite/core";
import { IDEMPOTENCY_HEADER, platformFetch, readSuccessData } from "./api";
import { toProblemError } from "./problem-error";

const staleFieldSchema = z.object({
  name: z.string(),
  reason: z.string(),
});

export const appSettingsDefaultsViewSchema = z.object({
  appId: z.string().min(1).max(64),
  schema: z.object({ fields: z.array(settingsFieldDefinitionSchema) }),
  values: z.record(z.unknown()),
  effectiveValues: z.record(z.unknown()),
  sources: z.record(settingsValueSourceSchema),
  staleFields: z.array(staleFieldSchema),
  version: z.string().min(1).max(64),
});

export const appSettingsDefaultsWriteResultSchema =
  appSettingsDefaultsViewSchema.extend({
    removedFields: z.array(z.string()),
  });

export type AppSettingsDefaultsView = z.infer<
  typeof appSettingsDefaultsViewSchema
>;
export type AppSettingsDefaultsWriteResult = z.infer<
  typeof appSettingsDefaultsWriteResultSchema
>;
export type SettingsField = SettingsFieldDefinition;

function settingsPath(appId: string): string {
  return `/api/v1/admin/apps/${encodeURIComponent(appId)}/settings`;
}

export async function fetchAppSettingsDefaults(
  appId: string,
  signal?: AbortSignal,
): Promise<AppSettingsDefaultsView> {
  const response = await platformFetch(
    settingsPath(appId),
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, appSettingsDefaultsViewSchema);
}

export async function updateAppSettingsDefaults(input: {
  readonly appId: string;
  readonly values: Record<string, unknown>;
  readonly expectedVersion: string;
  readonly idempotencyKey: string;
}): Promise<AppSettingsDefaultsWriteResult> {
  const response = await platformFetch(settingsPath(input.appId), {
    method: "PATCH",
    headers: { [IDEMPOTENCY_HEADER]: input.idempotencyKey },
    body: JSON.stringify({
      values: input.values,
      expectedVersion: input.expectedVersion,
    }),
  });
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, appSettingsDefaultsWriteResultSchema);
}
