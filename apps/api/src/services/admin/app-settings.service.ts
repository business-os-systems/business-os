import { Prisma, type PrismaClient } from "@suite/db";
import {
  PLATFORM_ERROR_CODE,
  isInstalledAppSettingsMetadataKey,
  isSettingsValues,
  resolveAppSettings,
  validateAppSettings,
  validateTenantAppSettings,
  type AppSettingsDefinition,
  type SettingsValues,
} from "@suite/core";
import {
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  ValidationError,
} from "@suite/core/errors";
import type {
  AppSettingsView,
  AppSettingsWriteResult,
} from "./entitlement.contract.js";
import {
  throwMappedPlatformSqlError,
  type PlatformSqlErrorRule,
} from "./platform-sql-errors.js";
import { assertTenantExists } from "./tenant-view.service.js";
import { requireAppSettingsDefinition } from "./app-settings-shared.js";
import { readAppSettingsDefaultsValues } from "./app-settings-defaults.service.js";

export interface GetAppSettingsInput {
  readonly organizationId: string;
  readonly appId: string;
}

export interface UpdateAppSettingsInput extends GetAppSettingsInput {
  readonly values: SettingsValues;
  readonly expectedVersion: string;
  readonly operatorId: string;
  readonly requestId: string;
}

interface AppSettingsRow {
  readonly settings: unknown;
  readonly version: string;
}

interface InstalledAppSettingsParts {
  readonly config: SettingsValues;
  readonly metadata: SettingsValues;
}

const SETTINGS_SQL_RULES: readonly PlatformSqlErrorRule[] = [
  {
    sqlState: "PT409",
    create: () =>
      new ConflictError(
        "The application settings changed since they were observed. Reload the app and retry.",
        { code: PLATFORM_ERROR_CODE.VERSION_CONFLICT }
      ),
  },
  {
    sqlState: "PT422",
    messagePattern: /UNKNOWN_APP/,
    create: () =>
      new ValidationError(
        "The application is not installed for this tenant.",
        undefined,
        { code: PLATFORM_ERROR_CODE.UNKNOWN_APP }
      ),
  },
  {
    sqlState: "PT422",
    create: () =>
      new ValidationError(
        "Application settings failed validation.",
        undefined,
        { code: PLATFORM_ERROR_CODE.SETTINGS_INVALID }
      ),
  },
  {
    sqlState: "PT404",
    create: () =>
      new NotFoundError("Tenant not found.", {
        code: PLATFORM_ERROR_CODE.TENANT_NOT_FOUND,
      }),
  },
  {
    sqlState: "PT403",
    create: () =>
      new ForbiddenError("Capability denied.", {
        code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED,
      }),
  },
];

/**
 * InstalledApp.settings is a mixed bag: the install path stores the manifest
 * snapshot and installedBy there alongside app configuration. Only the
 * configuration keys are validated, returned or replaced; metadata is preserved
 * verbatim so a settings write can never strip the tenant's navigation snapshot
 * or its personal-data reference (FR-111).
 */
function splitInstalledAppSettings(
  settings: SettingsValues
): InstalledAppSettingsParts {
  const config: SettingsValues = {};
  const metadata: SettingsValues = {};
  for (const [key, value] of Object.entries(settings)) {
    if (isInstalledAppSettingsMetadataKey(key)) {
      metadata[key] = value;
    } else {
      config[key] = value;
    }
  }
  return { config, metadata };
}

async function readSettingsRow(
  prisma: Prisma.TransactionClient,
  input: GetAppSettingsInput
): Promise<AppSettingsRow | null> {
  const rows = await prisma.$queryRaw<AppSettingsRow[]>(Prisma.sql`
    SELECT "settings", "version"
    FROM platform."v_tenant_app_entitlements"
    WHERE "organizationId" = ${input.organizationId}
      AND "appId" = ${input.appId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

function requireStoredSettings(row: AppSettingsRow): SettingsValues {
  if (!isSettingsValues(row.settings)) {
    throw new InternalServerError(
      "Stored application settings are not a JSON object."
    );
  }
  return row.settings;
}

/**
 * Reads the stored configuration and validates it against the current schema.
 * A value that no longer validates is surfaced as a stale field and is never
 * discarded or rewritten (FR-111).
 */
export async function getAppSettings(
  prisma: PrismaClient,
  input: GetAppSettingsInput
): Promise<AppSettingsView> {
  const definition = requireAppSettingsDefinition(input.appId);
  const row = await readSettingsRow(prisma, input);
  if (row === null) {
    await assertTenantExists(prisma, input.organizationId);
    throw new ValidationError(
      "The application is not installed for this tenant.",
      undefined,
      { code: PLATFORM_ERROR_CODE.UNKNOWN_APP }
    );
  }

  const stored = requireStoredSettings(row);
  const { config } = splitInstalledAppSettings(stored);
  const validation = validateTenantAppSettings(definition, config);
  const appDefaults = await readAppSettingsDefaultsValues(prisma, input.appId);
  const resolved = resolveAppSettings(definition, {
    appDefaults,
    tenantOverrides: config,
  });

  return {
    appId: input.appId,
    schema: { fields: definition.fields },
    values: config,
    effectiveValues: resolved.values,
    sources: resolved.sources,
    staleFields: validation.success ? [] : validation.issues,
    version: row.version,
  };
}

interface ApplySettingsOptions {
  readonly tx: Prisma.TransactionClient;
  readonly definition: AppSettingsDefinition;
  readonly input: UpdateAppSettingsInput;
  readonly values: SettingsValues;
}

async function applySettings(
  options: ApplySettingsOptions
): Promise<AppSettingsWriteResult> {
  const { tx, definition, input, values } = options;
  const current = await readSettingsRow(tx, input);
  const currentParts =
    current === null
      ? { config: {}, metadata: {} }
      : splitInstalledAppSettings(requireStoredSettings(current));

  const removedFields = Object.keys(currentParts.config)
    .filter((key) => !Object.prototype.hasOwnProperty.call(values, key))
    .sort();
  const mergedSettings = { ...currentParts.metadata, ...values };

  const rows = await tx.$queryRaw<AppSettingsRow[]>(Prisma.sql`
    SELECT * FROM platform.fn_set_app_setting_versioned(
      ${input.organizationId},
      ${input.appId},
      ${JSON.stringify(mergedSettings)}::jsonb,
      ${input.expectedVersion},
      ${input.operatorId},
      ${input.requestId}
    )
  `);
  const row = rows[0];
  if (row === undefined) {
    throw new InternalServerError(
      "The settings function returned no stored value."
    );
  }

  const stored = requireStoredSettings(row);
  const { config: storedConfig } = splitInstalledAppSettings(stored);
  if (!validateAppSettings(definition, storedConfig).success) {
    throw new InternalServerError(
      "The settings function stored a payload that fails its own schema."
    );
  }

  return {
    appId: input.appId,
    values: storedConfig,
    removedFields,
    staleFields: [],
    version: row.version,
  };
}

/**
 * Validates before anything is stored (FR-088), then writes through the
 * versioned definer function so the state change and the audit row share one
 * transaction (CT-4). Removed configuration keys are reported so a schema
 * evolution can never be resolved silently (FR-111).
 */
export async function updateAppSettings(
  prisma: PrismaClient,
  input: UpdateAppSettingsInput
): Promise<AppSettingsWriteResult> {
  const definition = requireAppSettingsDefinition(input.appId);
  await assertTenantExists(prisma, input.organizationId);

  const validation = validateTenantAppSettings(definition, input.values);
  if (!validation.success) {
    throw new ValidationError(
      "Application settings failed validation.",
      validation.issues,
      { code: PLATFORM_ERROR_CODE.SETTINGS_INVALID }
    );
  }

  try {
    return await prisma.$transaction((tx) =>
      applySettings({
        tx,
        definition,
        input,
        values: validation.values,
      })
    );
  } catch (error) {
    throwMappedPlatformSqlError(error, SETTINGS_SQL_RULES);
  }
}
