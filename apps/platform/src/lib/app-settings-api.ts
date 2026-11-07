import { z } from "zod";
import {
  settingsFieldDefinitionSchema,
  type SettingsFieldDefinition,
} from "@suite/core";
import { IDEMPOTENCY_HEADER, platformFetch, readSuccessData } from "./api";
import { toProblemError } from "./problem-error";

const staleFieldSchema = z.object({
  name: z.string(),
  reason: z.string(),
});

export const appSettingsViewSchema = z.object({
  appId: z.string().min(1).max(64),
  schema: z.object({ fields: z.array(settingsFieldDefinitionSchema) }),
  values: z.record(z.unknown()),
  staleFields: z.array(staleFieldSchema),
  version: z.string().min(1).max(64),
});

export const appSettingsWriteResultSchema = z.object({
  appId: z.string().min(1).max(64),
  values: z.record(z.unknown()),
  removedFields: z.array(z.string()),
  staleFields: z.array(staleFieldSchema),
  version: z.string().min(1).max(64),
});

export type AppSettingsView = z.infer<typeof appSettingsViewSchema>;
export type AppSettingsWriteResult = z.infer<
  typeof appSettingsWriteResultSchema
>;
export type SettingsField = SettingsFieldDefinition;

function settingsPath(orgId: string, appId: string): string {
  return `/api/v1/admin/tenants/${encodeURIComponent(orgId)}/apps/${encodeURIComponent(appId)}/settings`;
}

export async function fetchAppSettings(
  orgId: string,
  appId: string,
  signal?: AbortSignal
): Promise<AppSettingsView> {
  const response = await platformFetch(
    settingsPath(orgId, appId),
    signal === undefined ? {} : { signal }
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, appSettingsViewSchema);
}

export async function updateAppSettings(input: {
  readonly orgId: string;
  readonly appId: string;
  readonly values: Record<string, unknown>;
  readonly expectedVersion: string;
  readonly idempotencyKey: string;
}): Promise<AppSettingsWriteResult> {
  const response = await platformFetch(settingsPath(input.orgId, input.appId), {
    method: "PUT",
    headers: { [IDEMPOTENCY_HEADER]: input.idempotencyKey },
    body: JSON.stringify({
      values: input.values,
      expectedVersion: input.expectedVersion,
    }),
  });
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return readSuccessData(response, appSettingsWriteResultSchema);
}
