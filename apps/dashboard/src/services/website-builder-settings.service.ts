import { z } from "zod";
import { cookies } from "next/headers";
import {
  PLATFORM_ERROR_CODE,
  TIMEOUTS,
  settingsFieldDefinitionSchema,
  settingsValueSourceSchema,
  type SettingsFieldDefinition,
  type SettingsValueSource,
} from "@suite/core";
import { SESSION_COOKIE_NAME } from "@/lib/auth-constants";
import { getApiServerUrl } from "@/lib/env";

/**
 * Tenant configuration for the Website Builder installation.
 *
 * The effective value and its source come from the API, not from the raw
 * installation row: the application default lives in the platform schema that
 * the tenant identity cannot read, and the schema default must be shown when no
 * override exists (FR-014). The tenant session cookie is forwarded; the
 * workspace is never a client-supplied id. Only declared settings fields are
 * returned, so site and inquiry data never enters this read (FR-159).
 */

export const SETTINGS_READ_PATH = "/api/v1/cms/settings";

export interface WebsiteBuilderConfigurationField {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly displayValue: string;
  readonly source: SettingsValueSource;
}

export type WebsiteBuilderConfigurationResult =
  | { readonly kind: "ready"; readonly fields: readonly WebsiteBuilderConfigurationField[] }
  | { readonly kind: "not_installed" }
  | { readonly kind: "unavailable"; readonly message: string };

const settingsViewSchema = z
  .object({
    appId: z.string().min(1).max(64),
    fields: z.array(settingsFieldDefinitionSchema),
    effectiveValues: z.record(z.unknown()),
    sources: z.record(settingsValueSourceSchema),
  })
  .strict();

const settingsEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: z.object({ settings: settingsViewSchema }).strict(),
    requestId: z.string(),
    timestamp: z.string(),
  })
  .strict();

const problemSchema = z.object({
  code: z.string().optional(),
  detail: z.string().optional(),
});

class SettingsReadError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = "SettingsReadError";
    this.code = code;
  }
}

async function readSessionCookie(): Promise<string> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (value === undefined || value.length === 0) {
    throw new SettingsReadError(
      "An authenticated workspace session is required to read settings.",
      PLATFORM_ERROR_CODE.AUTH_REQUIRED
    );
  }
  return value;
}

async function parseProblem(response: Response): Promise<SettingsReadError> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = problemSchema.safeParse(body);
  if (parsed.success) {
    return new SettingsReadError(
      parsed.data.detail ?? "The settings request failed with status " + String(response.status) + ".",
      parsed.data.code ?? null
    );
  }
  return new SettingsReadError(
    "The settings request failed with status " + String(response.status) + ".",
    null
  );
}

async function requestSettings() {
  const sessionCookie = await readSessionCookie();
  const response = await fetch(getApiServerUrl() + SETTINGS_READ_PATH, {
    headers: {
      Accept: "application/json",
      Cookie: SESSION_COOKIE_NAME + "=" + sessionCookie,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUTS.DEFAULT_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw await parseProblem(response);
  }
  const parsed = settingsEnvelopeSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new SettingsReadError(
      "The settings response did not match the expected contract.",
      null
    );
  }
  return parsed.data.data.settings;
}

function displayValue(field: SettingsFieldDefinition, value: unknown): string {
  switch (field.kind) {
    case "boolean":
      return value === true ? "Enabled" : "Disabled";
    case "text":
      return typeof value === "string" && value.trim() !== "" ? value : "Not set";
  }
}

function requireEffectiveValue(
  values: Readonly<Record<string, unknown>>,
  key: string
): unknown {
  if (!Object.prototype.hasOwnProperty.call(values, key)) {
    throw new SettingsReadError(
      "The settings response omitted the effective value for " + key + ".",
      null
    );
  }
  return values[key];
}

function requireSource(
  sources: Readonly<Record<string, SettingsValueSource>>,
  key: string
): SettingsValueSource {
  const source = sources[key];
  if (source === undefined) {
    throw new SettingsReadError(
      "The settings response omitted the source for " + key + ".",
      null
    );
  }
  return source;
}

function toConfigurationField(
  field: SettingsFieldDefinition,
  values: Readonly<Record<string, unknown>>,
  sources: Readonly<Record<string, SettingsValueSource>>
): WebsiteBuilderConfigurationField {
  return {
    key: field.key,
    label: field.label,
    description: field.description,
    displayValue: displayValue(field, requireEffectiveValue(values, field.key)),
    source: requireSource(sources, field.key),
  };
}

export async function readWebsiteBuilderConfiguration(): Promise<WebsiteBuilderConfigurationResult> {
  try {
    const settings = await requestSettings();
    return {
      kind: "ready",
      fields: settings.fields.map((field) =>
        toConfigurationField(field, settings.effectiveValues, settings.sources)
      ),
    };
  } catch (error: unknown) {
    if (error instanceof SettingsReadError) {
      if (error.code === PLATFORM_ERROR_CODE.APP_NOT_INSTALLED) {
        return { kind: "not_installed" };
      }
      return { kind: "unavailable", message: error.message };
    }
    return {
      kind: "unavailable",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
