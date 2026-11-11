import { z } from "zod";
import {
  FaqBlockPropsSchema,
  FeaturesBlockPropsSchema,
  FooterBlockPropsSchema,
  FormBlockPropsSchema,
  HeroBlockPropsSchema,
  NavbarBlockPropsSchema,
  PricingBlockPropsSchema,
  RichTextBlockPropsSchema,
  type BlockType,
} from "@suite/website-builder/ast";
import { BLOCK_BLUEPRINTS } from "@suite/website-builder/editor";
import { CATALOG_BLOCK_TYPES, CATALOG_CONTRACT_VERSION } from "@/lib/catalog-schema";
import type { CatalogItemKind } from "@/lib/catalog-api";
import { readPath } from "@/lib/catalog-paths";

/**
 * The declarative catalog form schema. Every control is declared here and
 * rendered through the shared ConfigFormRenderer; no screen hand-writes an
 * input. A section's fields are generated from the production props schema of
 * its declared section type, so the editor and the AST validator cannot drift
 * (FR-147). The same draft object backs the JSON tab (FR-148).
 */

export interface CatalogFormOption {
  readonly value: string;
  readonly label: string;
}

interface CatalogFormFieldIdentity {
  readonly path: string;
  readonly label: string;
  readonly description: string;
  readonly required: boolean;
}

const NULLABLE_TEXT_CONTROL = "nullable-text" as const;

export interface CatalogTextFormField extends CatalogFormFieldIdentity {
  readonly control:
    | "text"
    | "textarea"
    | "list"
    | typeof NULLABLE_TEXT_CONTROL
    | "number"
    | "boolean";
}

export interface CatalogSelectFormField extends CatalogFormFieldIdentity {
  readonly control: "select" | "block-type";
  readonly options: readonly CatalogFormOption[];
}

export type CatalogFormField = CatalogTextFormField | CatalogSelectFormField;

const PROPS_PATH = "definition.block.props";
const MAX_TEXTAREA_LENGTH = 200;
const DECLARED_BY_SECTION_TYPE = "declared by the section type.";

const FIELD_ACRONYMS: Readonly<Record<string, string>> = {
  url: "URL",
  cta: "CTA",
  html: "HTML",
  id: "ID",
  faq: "FAQ",
  seo: "SEO",
};

/** Turns a declared property name into its operator-facing label. */
function humanizeSegment(segment: string): string {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 0)
    .map((word) => {
      const acronym = FIELD_ACRONYMS[word.toLowerCase()];
      if (acronym !== undefined) {
        return acronym;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/** Narrows a Zod schema value without trusting an unchecked cast. */
function toSchema(value: unknown): z.ZodTypeAny | null {
  return value instanceof z.ZodType ? value : null;
}

/** Removes optional/nullable/default/effects wrappers without guessing. */
function unwrapSchema(value: unknown): z.ZodTypeAny | null {
  let current = toSchema(value);
  while (current !== null) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = toSchema(current.unwrap());
      continue;
    }
    if (current instanceof z.ZodDefault) {
      current = toSchema(current.removeDefault());
      continue;
    }
    if (current instanceof z.ZodEffects) {
      current = toSchema(current.innerType());
      continue;
    }
    return current;
  }
  return null;
}

function isDeclaredOptional(value: unknown): boolean {
  const schema = toSchema(value);
  if (schema === null) {
    return false;
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    return true;
  }
  if (schema instanceof z.ZodEffects) {
    return isDeclaredOptional(schema.innerType());
  }
  return false;
}

function isDeclaredNullable(value: unknown): boolean {
  const schema = toSchema(value);
  if (schema === null) {
    return false;
  }
  if (schema instanceof z.ZodNullable) {
    return true;
  }
  if (schema instanceof z.ZodOptional) {
    return isDeclaredNullable(schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) {
    return isDeclaredNullable(schema.removeDefault());
  }
  if (schema instanceof z.ZodEffects) {
    return isDeclaredNullable(schema.innerType());
  }
  return false;
}

function literalValue(value: unknown): string | number | null {
  const schema = unwrapSchema(value);
  if (!(schema instanceof z.ZodLiteral)) {
    return null;
  }
  const literal: unknown = schema.value;
  if (typeof literal === "string" || typeof literal === "number") {
    return literal;
  }
  return null;
}

function enumOptions(value: unknown): readonly string[] | null {
  const schema = toSchema(value);
  if (schema === null || !(schema instanceof z.ZodEnum)) {
    return null;
  }
  const options: unknown = schema.options;
  if (!Array.isArray(options)) {
    return null;
  }
  const values: string[] = [];
  for (const option of options) {
    if (typeof option !== "string") {
      return null;
    }
    values.push(option);
  }
  return values;
}

function unionLiteralValues(value: unknown): readonly (string | number)[] | null {
  const schema = toSchema(value);
  if (schema === null || !(schema instanceof z.ZodUnion)) {
    return null;
  }
  const options: unknown = schema.options;
  if (!Array.isArray(options)) {
    return null;
  }
  const values: (string | number)[] = [];
  for (const option of options) {
    const literal = literalValue(option);
    if (literal === null) {
      return null;
    }
    values.push(literal);
  }
  return values;
}

/** Select options come from the declared enum or literal union, never a copy. */
function selectOptionsFor(value: unknown): readonly CatalogFormOption[] | null {
  const enumValues = enumOptions(value);
  if (enumValues !== null) {
    return enumValues.map((option) => ({ value: option, label: humanizeSegment(option) }));
  }
  const literalValues = unionLiteralValues(value);
  if (literalValues === null) {
    return null;
  }
  return literalValues.map((literal) => {
    const text = String(literal);
    return { value: text, label: humanizeSegment(text) };
  });
}

function textControl(
  schema: z.ZodString,
  nullable: boolean,
): typeof NULLABLE_TEXT_CONTROL | "textarea" | "text" {
  if (nullable) {
    return NULLABLE_TEXT_CONTROL;
  }
  if (schema.maxLength !== null && schema.maxLength > MAX_TEXTAREA_LENGTH) {
    return "textarea";
  }
  return "text";
}

function textDescription(schema: z.ZodString): string {
  if (schema.maxLength !== null) {
    return "Up to " + schema.maxLength + " characters " + DECLARED_BY_SECTION_TYPE;
  }
  return "A text value " + DECLARED_BY_SECTION_TYPE;
}

function fieldDescription(
  schema: z.ZodTypeAny,
  control: CatalogTextFormField["control"] | "select",
): string {
  if (schema.description !== undefined) {
    return schema.description;
  }
  switch (control) {
    case "number":
      return "A number " + DECLARED_BY_SECTION_TYPE;
    case "boolean":
      return "A true or false value " + DECLARED_BY_SECTION_TYPE;
    case "select":
      return "One of the values this section type declares.";
    case "list":
      return "A comma-separated list of values.";
    case "textarea":
    case "text":
    case NULLABLE_TEXT_CONTROL:
      return schema instanceof z.ZodString
        ? textDescription(schema)
        : "A value " + DECLARED_BY_SECTION_TYPE;
  }
}

interface LeafInput {
  readonly segment: string;
  readonly schema: z.ZodTypeAny;
  readonly path: readonly string[];
  readonly required: boolean;
  readonly nullable: boolean;
}

function leafField(input: LeafInput): CatalogFormField | null {
  const identity = {
    path: input.path.join("."),
    label: humanizeSegment(input.segment),
    required: input.required,
  };
  if (input.schema instanceof z.ZodString) {
    const control = textControl(input.schema, input.nullable);
    return { ...identity, control, description: fieldDescription(input.schema, control) };
  }
  if (input.schema instanceof z.ZodNumber) {
    return { ...identity, control: "number", description: fieldDescription(input.schema, "number") };
  }
  if (input.schema instanceof z.ZodBoolean) {
    return { ...identity, control: "boolean", description: fieldDescription(input.schema, "boolean") };
  }
  const options = selectOptionsFor(input.schema);
  if (options !== null) {
    return {
      ...identity,
      control: "select",
      options,
      description: fieldDescription(input.schema, "select"),
    };
  }
  return null;
}

interface SchemaFieldsInput {
  readonly segment: string;
  readonly schema: unknown;
  readonly parentPath: readonly string[];
  readonly required: boolean;
}

function stringListField(input: {
  readonly segment: string;
  readonly schema: z.ZodString;
  readonly path: readonly string[];
  readonly required: boolean;
}): CatalogFormField {
  return {
    path: input.path.join("."),
    label: humanizeSegment(input.segment),
    description: fieldDescription(input.schema, "list"),
    required: input.required,
    control: "list",
  };
}

function shapeEntries(value: unknown): readonly (readonly [string, z.ZodTypeAny])[] {
  const schema = toSchema(value);
  if (schema === null || !(schema instanceof z.ZodObject)) {
    return [];
  }
  const shape: unknown = schema.shape;
  if (typeof shape !== "object" || shape === null) {
    return [];
  }
  return Object.entries(shape).flatMap(([key, child]) => {
    const childSchema = toSchema(child);
    return childSchema === null ? [] : [[key, childSchema] as const];
  });
}

function fieldsForSchema(input: SchemaFieldsInput): readonly CatalogFormField[] {
  const schema = unwrapSchema(input.schema);
  if (schema === null) {
    return [];
  }
  const path = [...input.parentPath, input.segment];
  const required = input.required && !isDeclaredOptional(input.schema);
  const nullable = isDeclaredNullable(input.schema);
  const leaf = leafField({ segment: input.segment, schema, path, required, nullable });
  if (leaf !== null) {
    return [leaf];
  }
  if (schema instanceof z.ZodArray) {
    const element = unwrapSchema(schema.element);
    if (!(element instanceof z.ZodString)) {
      return [];
    }
    return [stringListField({ segment: input.segment, schema: element, path, required })];
  }
  return shapeEntries(schema).flatMap(([key, child]) =>
    fieldsForSchema({ segment: key, schema: child, parentPath: path, required }),
  );
}

/**
 * Generates the section-specific fields from the section type's declared props
 * schema. Exported so a test can prove a newly declared property appears without
 * a parallel field map (FR-147).
 */
export function catalogFormFieldsFromPropsSchema(
  schema: unknown,
): readonly CatalogFormField[] {
  const props = unwrapSchema(schema);
  if (props === null) {
    return [];
  }
  return shapeEntries(props).flatMap(([key, child]) =>
    fieldsForSchema({ segment: key, schema: child, parentPath: PROPS_PATH.split("."), required: true }),
  );
}

const BLOCK_PROP_SCHEMAS = {
  hero: HeroBlockPropsSchema,
  features: FeaturesBlockPropsSchema,
  pricing: PricingBlockPropsSchema,
  form: FormBlockPropsSchema,
  faq: FaqBlockPropsSchema,
  "rich-text": RichTextBlockPropsSchema,
  navbar: NavbarBlockPropsSchema,
  footer: FooterBlockPropsSchema,
} as const satisfies Record<BlockType, z.ZodTypeAny>;

const METADATA_FIELDS: readonly CatalogFormField[] = [
  {
    control: "text",
    path: "name",
    label: "Name",
    description: "Operator-facing name shown in the catalog list.",
    required: true,
  },
  {
    control: "text",
    path: "slug",
    label: "Slug",
    description: "Stable picker key. Lower-case letters, digits, underscore or hyphen.",
    required: true,
  },
  {
    control: "text",
    path: "category",
    label: "Category",
    description: "Industry or use-case key used to group the catalog.",
    required: true,
  },
  {
    control: "list",
    path: "industries",
    label: "Industries",
    description: "Comma-separated industry keys used by targeting.",
    required: false,
  },
  {
    control: "text",
    path: "contractVersion",
    label: "Contract version",
    description: "The catalog contract this record was authored against (YYYY-MM).",
    required: true,
  },
  {
    control: "nullable-text",
    path: "flagKey",
    label: "Feature flag",
    description: "Optional rollout flag key. Empty means no flag.",
    required: false,
  },
  {
    control: "list",
    path: "targeting.plans",
    label: "Target plans",
    description: "Comma-separated plan keys. Empty targets every plan.",
    required: false,
  },
  {
    control: "list",
    path: "targeting.industries",
    label: "Target industries",
    description: "Comma-separated industry keys. Empty targets every industry.",
    required: false,
  },
  {
    control: "list",
    path: "targeting.orgAllowlist",
    label: "Tenant allowlist",
    description: "Comma-separated tenant ids allowed to see the item.",
    required: false,
  },
  {
    control: "list",
    path: "targeting.orgDenylist",
    label: "Tenant denylist",
    description: "Comma-separated tenant ids never offered the item.",
    required: false,
  },
];

const DEFINITION_VERSION_FIELD: CatalogFormField = {
  control: "text",
  path: "definition.schemaVersion",
  label: "Definition version",
  description: `The section, template or theme payload schema. The current version is ${CATALOG_CONTRACT_VERSION}.`,
  required: true,
};

const BLOCK_TYPE_FIELD: CatalogFormField = {
  control: "block-type",
  path: "definition.block.type",
  label: "Section type",
  description: "The production section type this preset instantiates.",
  required: true,
  options: CATALOG_BLOCK_TYPES.map((type) => ({
    value: type,
    label: BLOCK_BLUEPRINTS[type].title,
  })),
};

const SECTION_FORM_FIELDS: readonly CatalogFormField[] = [
  DEFINITION_VERSION_FIELD,
  BLOCK_TYPE_FIELD,
];

/**
 * Generates the field list for one kind. A section with an unreadable block
 * type renders its metadata only; it never guesses a type.
 */
export function catalogFormFields(
  kind: CatalogItemKind,
  blockType: BlockType | null,
): readonly CatalogFormField[] {
  if (kind !== "SECTION") {
    return [...METADATA_FIELDS, DEFINITION_VERSION_FIELD];
  }
  if (blockType === null) {
    return [...METADATA_FIELDS, ...SECTION_FORM_FIELDS];
  }
  return [
    ...METADATA_FIELDS,
    ...SECTION_FORM_FIELDS,
    ...catalogFormFieldsFromPropsSchema(BLOCK_PROP_SCHEMAS[blockType]),
  ];
}

/** Reads a draft value into the string control the shared renderer expects. */
export function fieldText(field: CatalogFormField, draft: unknown): string {
  const raw = readPath(draft, field.path);
  if (field.control === "list") {
    return Array.isArray(raw) ? raw.map(String).join(", ") : "";
  }
  if (typeof raw === "string") {
    return raw;
  }
  if (typeof raw === "number") {
    return String(raw);
  }
  if (typeof raw === "boolean") {
    return String(raw);
  }
  return "";
}

/** Parses a control value into the draft value its schema field expects. */
export function fieldValue(field: CatalogFormField, input: string): unknown {
  if (field.control === "list") {
    return input
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  if (field.control === NULLABLE_TEXT_CONTROL) {
    const trimmed = input.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (field.control === "number") {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : input;
  }
  if (field.control === "boolean") {
    return input === "true";
  }
  return input;
}
