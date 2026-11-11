import { prisma } from "@suite/db";
import {
  getAppSettingsDefinition,
  type SettingsFieldDefinition,
} from "@suite/core";
import { WEBSITE_BUILDER_APP_ID } from "@/components/layout/website-builder-nav.config";

/**
 * Tenant configuration for the Website Builder installation. Only declared
 * settings fields are returned; site and inquiry data never enters this read
 * (FR-159). A missing installation is reported, never treated as empty config.
 */

export type WebsiteBuilderConfigurationField =
  | {
      readonly kind: "configured";
      readonly key: string;
      readonly label: string;
      readonly description: string;
      readonly displayValue: string;
    }
  | {
      readonly kind: "default";
      readonly key: string;
      readonly label: string;
      readonly description: string;
      readonly displayValue: string;
    };

export type WebsiteBuilderConfigurationResult =
  | { readonly kind: "ready"; readonly fields: readonly WebsiteBuilderConfigurationField[] }
  | { readonly kind: "not_installed" };

type SettingValueState =
  | { readonly kind: "configured"; readonly displayValue: string }
  | { readonly kind: "default" };

function isSettingsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBooleanSetting(value: unknown): SettingValueState {
  if (value === true) {
    return { kind: "configured", displayValue: "Enabled" };
  }
  if (value === false) {
    return { kind: "configured", displayValue: "Disabled" };
  }
  return { kind: "default" };
}

function readTextSetting(value: unknown): SettingValueState {
  if (typeof value === "string" && value.trim().length > 0) {
    return { kind: "configured", displayValue: value };
  }
  return { kind: "default" };
}

function readSettingValue(
  field: SettingsFieldDefinition,
  value: unknown
): SettingValueState {
  if (field.kind === "boolean") {
    return readBooleanSetting(value);
  }
  return readTextSetting(value);
}

function configuredField(
  field: SettingsFieldDefinition,
  state: SettingValueState
): WebsiteBuilderConfigurationField {
  if (state.kind === "configured") {
    return {
      kind: "configured",
      key: field.key,
      label: field.label,
      description: field.description,
      displayValue: state.displayValue,
    };
  }
  return {
    kind: "default",
    key: field.key,
    label: field.label,
    description: field.description,
    displayValue: "Not configured",
  };
}

export async function readWebsiteBuilderConfiguration(
  organizationId: string
): Promise<WebsiteBuilderConfigurationResult> {
  const definition = getAppSettingsDefinition(WEBSITE_BUILDER_APP_ID);
  if (definition === null) {
    throw new Error("Website Builder settings definition is not registered.");
  }

  const installation = await prisma.installedApp.findFirst({
    where: {
      organizationId,
      appId: WEBSITE_BUILDER_APP_ID,
      isEnabled: true,
    },
    select: { settings: true },
  });
  if (installation === null) {
    return { kind: "not_installed" };
  }
  const storedSettings = installation.settings;
  if (!isSettingsRecord(storedSettings)) {
    throw new Error("Stored Website Builder settings are not a JSON object.");
  }

  const fields = definition.fields.map((field) =>
    configuredField(field, readSettingValue(field, storedSettings[field.key]))
  );
  return { kind: "ready", fields };
}
