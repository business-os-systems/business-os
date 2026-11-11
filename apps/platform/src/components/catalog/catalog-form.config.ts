import type { BlockType } from "@suite/website-builder/ast";
import { BLOCK_BLUEPRINTS } from "@suite/website-builder/editor";
import { CATALOG_BLOCK_TYPES, CATALOG_CONTRACT_VERSION } from "@/lib/catalog-schema";
import type { CatalogItemKind } from "@/lib/catalog-api";
import { readPath } from "@/lib/catalog-paths";

/**
 * The declarative catalog form schema. Every control is declared here and
 * rendered through the shared ConfigFormRenderer; no screen hand-writes an
 * input. The same draft object backs the JSON tab (FR-147, FR-148).
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

export interface CatalogTextFormField extends CatalogFormFieldIdentity {
  readonly control: "text" | "textarea" | "list" | "nullable-text";
}

export interface CatalogSelectFormField extends CatalogFormFieldIdentity {
  readonly control: "select" | "block-type";
  readonly options: readonly CatalogFormOption[];
}

export type CatalogFormField = CatalogTextFormField | CatalogSelectFormField;

const HEADLINE = "Headline";
const SUBHEADLINE = "Subheadline";
const HEADLINE_DESCRIPTION = "The main heading rendered at the top of this section.";
const SUBHEADLINE_DESCRIPTION = "Supporting copy rendered beneath the headline.";
const OPTIONAL_HINT = "Leave blank to omit this property from the preset.";

interface BlockPropFieldInput {
  readonly path: string;
  readonly label: string;
  readonly control: CatalogTextFormField["control"];
  readonly required: boolean;
  readonly description: string;
}

function blockPropField(input: BlockPropFieldInput): CatalogTextFormField {
  return {
    control: input.control,
    path: `definition.block.props.${input.path}`,
    label: input.label,
    description: input.description,
    required: input.required,
  };
}

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

const BLOCK_PROP_FIELDS = {
  hero: [
    blockPropField({
      path: "headline",
      label: HEADLINE,
      control: "text",
      required: true,
      description: HEADLINE_DESCRIPTION,
    }),
    blockPropField({
      path: "subheadline",
      label: SUBHEADLINE,
      control: "textarea",
      required: false,
      description: SUBHEADLINE_DESCRIPTION,
    }),
    blockPropField({
      path: "badge",
      label: "Badge",
      control: "text",
      required: false,
      description: OPTIONAL_HINT,
    }),
    blockPropField({
      path: "primaryCta.label",
      label: "Primary action",
      control: "text",
      required: false,
      description: "Label of the primary call to action.",
    }),
    blockPropField({
      path: "primaryCta.target.url",
      label: "Primary action link",
      control: "text",
      required: false,
      description: "Relative path or https, mailto or tel address.",
    }),
    blockPropField({
      path: "imageUrl",
      label: "Image address",
      control: "text",
      required: false,
      description: "Relative path or https image address.",
    }),
  ],
  features: [
    blockPropField({
      path: "headline",
      label: HEADLINE,
      control: "text",
      required: false,
      description: HEADLINE_DESCRIPTION,
    }),
    blockPropField({
      path: "subheadline",
      label: SUBHEADLINE,
      control: "textarea",
      required: false,
      description: SUBHEADLINE_DESCRIPTION,
    }),
  ],
  pricing: [
    blockPropField({
      path: "headline",
      label: HEADLINE,
      control: "text",
      required: false,
      description: HEADLINE_DESCRIPTION,
    }),
    blockPropField({
      path: "subheadline",
      label: SUBHEADLINE,
      control: "textarea",
      required: false,
      description: SUBHEADLINE_DESCRIPTION,
    }),
  ],
  form: [
    blockPropField({
      path: "headline",
      label: HEADLINE,
      control: "text",
      required: false,
      description: HEADLINE_DESCRIPTION,
    }),
    blockPropField({
      path: "subheadline",
      label: SUBHEADLINE,
      control: "textarea",
      required: false,
      description: SUBHEADLINE_DESCRIPTION,
    }),
    blockPropField({
      path: "submitButtonText",
      label: "Submit label",
      control: "text",
      required: false,
      description: "Label on the form submit button.",
    }),
  ],
  faq: [
    blockPropField({
      path: "headline",
      label: HEADLINE,
      control: "text",
      required: false,
      description: HEADLINE_DESCRIPTION,
    }),
    blockPropField({
      path: "subheadline",
      label: SUBHEADLINE,
      control: "textarea",
      required: false,
      description: SUBHEADLINE_DESCRIPTION,
    }),
  ],
  "rich-text": [
    blockPropField({
      path: "contentHtml",
      label: "Content",
      control: "textarea",
      required: true,
      description: "Sanitised rich-text content.",
    }),
  ],
  navbar: [
    blockPropField({
      path: "logoText",
      label: "Logo text",
      control: "text",
      required: false,
      description: "Text wordmark shown when no logo image is set.",
    }),
    blockPropField({
      path: "logoUrl",
      label: "Logo image",
      control: "text",
      required: false,
      description: "Relative path or https logo address.",
    }),
  ],
  footer: [
    blockPropField({
      path: "logoText",
      label: "Logo text",
      control: "text",
      required: false,
      description: "Text wordmark shown in the footer.",
    }),
    blockPropField({
      path: "copyrightText",
      label: "Copyright",
      control: "text",
      required: false,
      description: "Copyright line rendered at the base of the footer.",
    }),
  ],
} as const satisfies Record<BlockType, readonly CatalogFormField[]>;

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
  return [...METADATA_FIELDS, ...SECTION_FORM_FIELDS, ...BLOCK_PROP_FIELDS[blockType]];
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
  if (field.control === "nullable-text") {
    const trimmed = input.trim();
    return trimmed === "" ? null : trimmed;
  }
  return input;
}
