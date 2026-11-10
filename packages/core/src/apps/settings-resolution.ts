import { z } from "zod";
import type {
  AppSettingsDefinition,
  SettingsFieldDefinition,
  SettingsValues,
} from "./settings-schemas.js";

export const settingsValueSourceSchema = z.enum(["tenant", "app", "schema"]);
export type SettingsValueSource = z.infer<typeof settingsValueSourceSchema>;

export interface SettingsResolutionInput {
  readonly appDefaults: SettingsValues;
  readonly tenantOverrides: SettingsValues;
}

export interface ResolvedSetting {
  readonly key: string;
  readonly value: unknown;
  readonly source: SettingsValueSource;
}

export interface ResolvedSettings {
  readonly values: SettingsValues;
  readonly sources: Record<string, SettingsValueSource>;
  readonly fields: readonly ResolvedSetting[];
}

function hasOwn(values: SettingsValues, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(values, key);
}

function sourceForField(
  field: SettingsFieldDefinition,
  input: SettingsResolutionInput
): SettingsValueSource {
  if (field.scope === "tenant" && hasOwn(input.tenantOverrides, field.key)) {
    return "tenant";
  }
  if (hasOwn(input.appDefaults, field.key)) {
    return "app";
  }
  return "schema";
}

function valueForSource(
  field: SettingsFieldDefinition,
  source: SettingsValueSource,
  input: SettingsResolutionInput
): unknown {
  switch (source) {
    case "tenant":
      return input.tenantOverrides[field.key];
    case "app":
      return input.appDefaults[field.key];
    case "schema":
      return field.defaultValue;
  }
}

/**
 * Resolves a setting from the most specific layer outward: the tenant override,
 * then the application default, then the schema default. Unknown keys are not
 * part of the definition and never enter the result.
 */
export function resolveAppSettings(
  definition: AppSettingsDefinition,
  input: SettingsResolutionInput
): ResolvedSettings {
  const values: SettingsValues = {};
  const sources: Record<string, SettingsValueSource> = {};
  const fields: ResolvedSetting[] = [];

  for (const field of definition.fields) {
    const source = sourceForField(field, input);
    const value = valueForSource(field, source, input);
    values[field.key] = value;
    sources[field.key] = source;
    fields.push({ key: field.key, value, source });
  }

  return { values, sources, fields };
}
