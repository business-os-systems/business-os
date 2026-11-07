import {
  getAppSettingsDefinition,
  validateAppSettings,
} from "@suite/core";
import type { ConfigFormField, ConfigFormErrors } from "@/components/forms/config-form.types";
import { isSafeFieldName } from "@/components/forms/invalid-params";
import type { SettingsField } from "@/lib/app-settings-api";

export type SettingsFormValues = Record<string, string>;

export const SETTINGS_FORM_ID = "tenant-app-settings";

/**
 * Turns the schema the application declares into the shared form schema. The
 * editor never hardcodes a field: a new app setting appears here after the
 * owning app updates its definition (FR-087).
 */
type BooleanSettingsField = Extract<SettingsField, { kind: "boolean" }>;
type TextSettingsField = Extract<SettingsField, { kind: "text" }>;

function buildBooleanSettingsField(
  field: BooleanSettingsField
): ConfigFormField<SettingsFormValues> {
  return {
    name: field.key,
    label: field.label,
    type: "checkbox",
    required: field.required,
    description: field.description,
  };
}

function buildTextSettingsField(
  field: TextSettingsField
): ConfigFormField<SettingsFormValues> {
  return {
    name: field.key,
    label: field.label,
    type: "text",
    required: field.required,
    maxLength: field.maxLength,
    placeholder: field.format === "bcp47" ? "e.g. en-IN" : undefined,
    description: field.description,
  };
}

const SETTINGS_FIELD_BUILDERS = {
  boolean: buildBooleanSettingsField,
  text: buildTextSettingsField,
} as const;

export function buildSettingsFormFields(
  fields: readonly SettingsField[]
): readonly ConfigFormField<SettingsFormValues>[] {
  return fields.map((field) => {
    switch (field.kind) {
      case "boolean":
        return SETTINGS_FIELD_BUILDERS.boolean(field);
      case "text":
        return SETTINGS_FIELD_BUILDERS.text(field);
    }
  });
}

function readText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readBoolean(value: unknown): string {
  return value === true ? "true" : "false";
}

export function toSettingsFormValues(
  fields: readonly SettingsField[],
  values: Readonly<Record<string, unknown>>
): SettingsFormValues {
  const result: SettingsFormValues = {};
  for (const field of fields) {
    if (!isSafeFieldName(field.key)) continue;
    result[field.key] =
      field.kind === "boolean"
        ? readBoolean(values[field.key])
        : readText(values[field.key]);
  }
  return result;
}

export function buildSettingsPayload(
  fields: readonly SettingsField[],
  values: SettingsFormValues
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    if (!isSafeFieldName(field.key)) continue;
    const value = values[field.key] ?? "";
    if (field.kind === "boolean") {
      payload[field.key] = value === "true";
      continue;
    }
    const trimmed = value.trim();
    if (trimmed !== "") {
      payload[field.key] = trimmed;
    }
  }
  return payload;
}

function compiledSettingsErrors(
  appId: string,
  fields: readonly SettingsField[],
  values: SettingsFormValues
): ConfigFormErrors<SettingsFormValues> {
  const errors: ConfigFormErrors<SettingsFormValues> = {};
  // The compiled schema is the client-side source of truth while the server
  // schema still matches it; a deployment skew falls back to the API's 422.
  const definition = getAppSettingsDefinition(appId);
  if (definition === null) return errors;
  const aligned =
    fields.length === definition.fields.length &&
    fields.every((field, index) => field.key === definition.fields[index]?.key);
  if (!aligned) return errors;
  const result = validateAppSettings(
    definition,
    buildSettingsPayload(fields, values)
  );
  if (result.success) return errors;
  for (const issue of result.issues) {
    if (isSafeFieldName(issue.name)) errors[issue.name] = issue.reason;
  }
  return errors;
}

export function validateSettingsForm(
  appId: string,
  fields: readonly SettingsField[],
  values: SettingsFormValues
): ConfigFormErrors<SettingsFormValues> {
  const errors: ConfigFormErrors<SettingsFormValues> = {};
  for (const field of fields) {
    if (!isSafeFieldName(field.key)) continue;
    if (field.required && (values[field.key] ?? "").trim() === "") {
      errors[field.key] = "This setting is required.";
    }
  }
  return { ...errors, ...compiledSettingsErrors(appId, fields, values) };
}
