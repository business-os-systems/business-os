import { z } from "zod";
import { isAppId, type AppId } from "../constants/app-manifests.js";
import { isInstalledAppSettingsMetadataKey } from "../constants/installed-app-metadata.js";

/**
 * App settings schema registry (T090, FR-087/FR-088/FR-111).
 *
 * Each application declares the fields Platform may store for its installation.
 * The registry is keyed by the compiled app manifest identifiers, so adding an
 * application to APP_MANIFESTS fails typecheck until its schema is registered.
 * The platform validates and stores; the owning application reads the values.
 */

export type SettingsValues = Record<string, unknown>;

const SETTINGS_ROOT_FIELD = "values";
const SETTINGS_KEY_MAX_LENGTH = 64;
const SETTINGS_LABEL_MAX_LENGTH = 120;
const SETTINGS_DESCRIPTION_MAX_LENGTH = 500;

/**
 * Named text formats rather than raw regular expressions: the descriptor stays
 * JSON-serialisable for the settings editor, and the validator lives in code.
 */
const SETTINGS_TEXT_FORMATS = ["bcp47"] as const;
type SettingsTextFieldFormat = (typeof SETTINGS_TEXT_FORMATS)[number];

const LANGUAGE_SUBTAG = /^[a-z]{2,3}$/;
const VARIANT_SUBTAG = /^[A-Za-z0-9]{2,8}$/;

/**
 * Shape-only BCP 47 check (FR-107 style): a language subtag followed by
 * optional hyphenated subtags. The split-based form avoids a nested quantifier
 * that backtracks catastrophically on hostile input.
 */
function isBcp47Tag(value: string): boolean {
  const [language, ...subtags] = value.split("-");
  if (language === undefined || !LANGUAGE_SUBTAG.test(language)) {
    return false;
  }
  return subtags.every((subtag) => VARIANT_SUBTAG.test(subtag));
}

interface TextFormatRule {
  readonly validate: (value: string) => boolean;
  readonly message: string;
}

const TEXT_FORMAT_RULES: Record<SettingsTextFieldFormat, TextFormatRule> = {
  bcp47: {
    validate: isBcp47Tag,
    message: "Use a BCP47 language tag such as en or en-IN.",
  },
};

const booleanSettingsFieldSchema = z
  .object({
    key: z.string().trim().min(1).max(SETTINGS_KEY_MAX_LENGTH),
    label: z.string().trim().min(1).max(SETTINGS_LABEL_MAX_LENGTH),
    description: z.string().trim().min(1).max(SETTINGS_DESCRIPTION_MAX_LENGTH),
    required: z.boolean(),
    kind: z.literal("boolean"),
  })
  .strict();

const textSettingsFieldSchema = z
  .object({
    key: z.string().trim().min(1).max(SETTINGS_KEY_MAX_LENGTH),
    label: z.string().trim().min(1).max(SETTINGS_LABEL_MAX_LENGTH),
    description: z.string().trim().min(1).max(SETTINGS_DESCRIPTION_MAX_LENGTH),
    required: z.boolean(),
    kind: z.literal("text"),
    minLength: z.number().int().nonnegative(),
    maxLength: z.number().int().positive(),
    format: z.enum(SETTINGS_TEXT_FORMATS).nullable(),
  })
  .strict();

export const settingsFieldDefinitionSchema = z.discriminatedUnion("kind", [
  booleanSettingsFieldSchema,
  textSettingsFieldSchema,
]);

export type SettingsFieldDefinition = z.infer<
  typeof settingsFieldDefinitionSchema
>;

export interface SettingsValidationIssue {
  readonly name: string;
  readonly reason: string;
}

export type SettingsValidationResult =
  | { readonly success: true; readonly values: SettingsValues }
  | {
      readonly success: false;
      readonly issues: readonly SettingsValidationIssue[];
    };

/** The caller-visible definition: what may be configured, not how it is checked. */
export interface AppSettingsDefinition {
  readonly appId: AppId;
  readonly fields: readonly SettingsFieldDefinition[];
}

interface CompiledAppSettingsDefinition extends AppSettingsDefinition {
  readonly schema: z.ZodType<SettingsValues, z.ZodTypeDef, SettingsValues>;
}

function buildTextFieldSchema(
  field: z.infer<typeof textSettingsFieldSchema>
): z.ZodTypeAny {
  if (field.maxLength < field.minLength) {
    throw new Error(
      `Settings field "${field.key}" declares maxLength below minLength.`
    );
  }
  const base = z
    .string()
    .trim()
    .min(field.minLength)
    .max(field.maxLength);
  if (field.format === null) {
    return base;
  }
  const rule = TEXT_FORMAT_RULES[field.format];
  return base.refine(rule.validate, { message: rule.message });
}

function buildFieldSchema(field: SettingsFieldDefinition): z.ZodTypeAny {
  switch (field.kind) {
    case "boolean":
      return z.boolean();
    case "text":
      return buildTextFieldSchema(field);
  }
}

function compileSettingsSchema(
  fields: readonly SettingsFieldDefinition[]
): z.ZodType<SettingsValues, z.ZodTypeDef, SettingsValues> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    const fieldSchema = buildFieldSchema(field);
    shape[field.key] = field.required ? fieldSchema : fieldSchema.optional();
  }
  return z.object(shape).strict();
}

function defineAppSettings(
  appId: AppId,
  fields: readonly SettingsFieldDefinition[]
): CompiledAppSettingsDefinition {
  for (const field of fields) {
    if (isInstalledAppSettingsMetadataKey(field.key)) {
      throw new Error(
        `Settings field "${field.key}" collides with installed-app metadata.`
      );
    }
  }
  return {
    appId,
    fields: [...fields],
    schema: compileSettingsSchema(fields),
  };
}

/**
 * Tenant-level settings the Website Builder installation accepts. The owning
 * application reads these values; Platform only validates and stores them.
 */
const WEBSITE_BUILDER_SETTINGS_FIELDS = [
  {
    key: "customDomainEnabled",
    label: "Custom domains",
    description:
      "Allow this tenant to attach custom domains to its published sites.",
    required: false,
    kind: "boolean",
  },
  {
    key: "defaultLocale",
    label: "Default locale",
    description:
      "Locale used for new sites when the request does not choose one.",
    required: false,
    kind: "text",
    minLength: 2,
    maxLength: 35,
    format: "bcp47",
  },
] as const satisfies readonly SettingsFieldDefinition[];

const COMPILED_SETTINGS_DEFINITIONS = {
  "website-builder": defineAppSettings(
    "website-builder",
    WEBSITE_BUILDER_SETTINGS_FIELDS
  ),
} as const satisfies Record<AppId, CompiledAppSettingsDefinition>;

export function getAppSettingsDefinition(
  appId: string
): AppSettingsDefinition | null {
  return isAppId(appId) ? COMPILED_SETTINGS_DEFINITIONS[appId] : null;
}

export function isSettingsValues(value: unknown): value is SettingsValues {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toIssues(issue: z.ZodIssue): SettingsValidationIssue[] {
  if (issue.code === "unrecognized_keys") {
    return issue.keys.map((key) => ({ name: key, reason: "Unknown setting." }));
  }
  const path = issue.path.map((segment) => String(segment)).join(".");
  return [
    {
      name: path === "" ? SETTINGS_ROOT_FIELD : path,
      reason: issue.message,
    },
  ];
}

/**
 * Validates an object against the application's declared schema. Unknown keys
 * are rejected by the strict object so a schema change can never be bypassed.
 */
export function validateAppSettings(
  definition: AppSettingsDefinition,
  payload: unknown
): SettingsValidationResult {
  if (!isSettingsValues(payload)) {
    return {
      success: false,
      issues: [
        {
          name: SETTINGS_ROOT_FIELD,
          reason: "Settings must be a JSON object.",
        },
      ],
    };
  }

  const schema = COMPILED_SETTINGS_DEFINITIONS[definition.appId].schema;
  const result = schema.safeParse(payload);
  if (result.success) {
    return { success: true, values: result.data };
  }
  return {
    success: false,
    issues: result.error.issues.flatMap(toIssues),
  };
}
