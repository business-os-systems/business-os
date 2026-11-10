import { Prisma, type PrismaClient } from "@suite/db";
import {
  PLATFORM_ERROR_CODE,
  isSettingsValues,
  resolveAppSettings,
  validateAppSettings,
  type AppSettingsDefinition,
  type SettingsValues,
} from "@suite/core";
import {
  ConflictError,
  InternalServerError,
  ValidationError,
} from "@suite/core/errors";
import {
  PLATFORM_AUDIT_ACTIONS,
  appendPlatformAuditEvent,
} from "@suite/auth/platform";
import type {
  AppSettingsDefaultsView,
  AppSettingsDefaultsWriteResult,
} from "./app-settings-defaults.contract.js";
import { requireAppSettingsDefinition } from "./app-settings-shared.js";

export interface UpdateAppSettingsDefaultsInput {
  readonly appId: string;
  readonly values: SettingsValues;
  readonly expectedVersion: string;
  readonly operatorId: string;
  readonly requestId: string;
}

interface DefaultsRow {
  readonly settings: unknown;
  readonly version: number;
}

function toJsonInput(values: SettingsValues): Prisma.InputJsonValue {
  // The compiled schema only admits JSON scalars, arrays and objects.
  return values as Prisma.InputJsonValue;
}

function requireStoredSettings(row: DefaultsRow): SettingsValues {
  if (!isSettingsValues(row.settings)) {
    throw new InternalServerError(
      "Stored application defaults are not a JSON object.",
    );
  }
  return row.settings;
}

async function readDefaultsRow(
  prisma: Prisma.TransactionClient,
  appId: string,
): Promise<DefaultsRow | null> {
  return prisma.appSettingsDefault.findUnique({
    where: { appId },
    select: { settings: true, version: true },
  });
}

/**
 * The tenant resolver reads the application defaults through this helper. A
 * missing row means no app-level default; the schema default still applies.
 */
export async function readAppSettingsDefaultsValues(
  prisma: PrismaClient | Prisma.TransactionClient,
  appId: string,
): Promise<SettingsValues> {
  const row = await readDefaultsRow(prisma, appId);
  return row === null ? {} : requireStoredSettings(row);
}

function toView(
  definition: AppSettingsDefinition,
  row: DefaultsRow | null,
): AppSettingsDefaultsView {
  const values = row === null ? {} : requireStoredSettings(row);
  const validation = validateAppSettings(definition, values);
  const resolved = resolveAppSettings(definition, {
    appDefaults: values,
    tenantOverrides: {},
  });
  return {
    appId: definition.appId,
    schema: { fields: definition.fields },
    values,
    effectiveValues: resolved.values,
    sources: resolved.sources,
    staleFields: validation.success ? [] : validation.issues,
    version: String(row?.version ?? 0),
  };
}

export async function getAppSettingsDefaults(
  prisma: PrismaClient,
  appId: string,
): Promise<AppSettingsDefaultsView> {
  const definition = requireAppSettingsDefinition(appId);
  return toView(definition, await readDefaultsRow(prisma, appId));
}

function parseVersion(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new ConflictError(
      "The application defaults changed since they were observed. Reload and retry.",
      { code: PLATFORM_ERROR_CODE.VERSION_CONFLICT },
    );
  }
  const version = Number(value);
  if (!Number.isSafeInteger(version)) {
    throw new ConflictError(
      "The application defaults changed since they were observed. Reload and retry.",
      { code: PLATFORM_ERROR_CODE.VERSION_CONFLICT },
    );
  }
  return version;
}

function conflict(): ConflictError {
  return new ConflictError(
    "The application defaults changed since they were observed. Reload and retry.",
    { code: PLATFORM_ERROR_CODE.VERSION_CONFLICT },
  );
}

async function writeDefaults(
  tx: Prisma.TransactionClient,
  input: UpdateAppSettingsDefaultsInput,
  values: SettingsValues,
): Promise<DefaultsRow> {
  const current = await readDefaultsRow(tx, input.appId);
  if (current === null) {
    if (parseVersion(input.expectedVersion) !== 0) {
      throw conflict();
    }
    try {
      return await tx.appSettingsDefault.create({
        data: {
          appId: input.appId,
          settings: toJsonInput(values),
          version: 1,
          updatedBy: input.operatorId,
        },
        select: { settings: true, version: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict();
      }
      throw error;
    }
  }

  if (parseVersion(input.expectedVersion) !== current.version) {
    throw conflict();
  }
  const updated = await tx.appSettingsDefault.updateMany({
    where: { appId: input.appId, version: current.version },
    data: {
      settings: toJsonInput(values),
      version: { increment: 1 },
      updatedBy: input.operatorId,
    },
  });
  if (updated.count !== 1) {
    throw conflict();
  }
  const next = await readDefaultsRow(tx, input.appId);
  if (next === null) {
    throw new InternalServerError(
      "The application defaults disappeared after the update.",
    );
  }
  return next;
}

/**
 * Replaces the app-level defaults after validating them against the compiled
 * schema. The version guard and audit row share the transaction (CT-3, CT-4).
 */
export async function updateAppSettingsDefaults(
  prisma: PrismaClient,
  input: UpdateAppSettingsDefaultsInput,
): Promise<AppSettingsDefaultsWriteResult> {
  const definition = requireAppSettingsDefinition(input.appId);
  const validation = validateAppSettings(definition, input.values);
  if (!validation.success) {
    throw new ValidationError(
      "Application defaults failed validation.",
      validation.issues,
      { code: PLATFORM_ERROR_CODE.SETTINGS_INVALID },
    );
  }

  return prisma.$transaction(async (tx) => {
    const current = await readDefaultsRow(tx, input.appId);
    const before = current === null ? {} : requireStoredSettings(current);
    const removedFields = Object.keys(before)
      .filter((key) => !Object.prototype.hasOwnProperty.call(validation.values, key))
      .sort();
    const stored = await writeDefaults(tx, input, validation.values);
    await appendPlatformAuditEvent(tx, {
      actorOperatorId: input.operatorId,
      action: PLATFORM_AUDIT_ACTIONS.APP_SETTINGS_DEFAULTS_SET,
      entityType: "app_settings_defaults",
      entityId: input.appId,
      before: { values: before },
      after: { values: validation.values },
      requestId: input.requestId,
    });
    return {
      ...toView(definition, stored),
      removedFields,
    };
  });
}
