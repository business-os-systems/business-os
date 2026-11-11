import { BlockAstSchema, MediaReferenceSchema } from "../../ast/schema.js";
import type { BlockAst, BlockType, MediaReference } from "../../ast/types.js";

interface FieldIdentity {
  readonly path: readonly string[];
  readonly label: string;
}

export interface TextFieldConfig extends FieldIdentity {
  readonly kind: "text";
  readonly placeholder: string;
  readonly maxLength: number;
}

export interface TextAreaFieldConfig extends FieldIdentity {
  readonly kind: "textarea";
  readonly placeholder: string;
  readonly maxLength: number;
  readonly rows: number;
}

export interface UrlFieldConfig extends FieldIdentity {
  readonly kind: "url";
  readonly placeholder: string;
}

export interface SelectOptionConfig {
  readonly label: string;
  readonly value: string;
}

export interface SelectFieldConfig extends FieldIdentity {
  readonly kind: "select";
  readonly options: readonly SelectOptionConfig[];
}

/**
 * An image slot chosen from the shared workspace library. Selecting stores the
 * asset identity at `path` and clears the legacy URL at `legacyPath`, so no
 * URL is ever copied into the block (FR-051, FR-120).
 */
export interface MediaFieldConfig extends FieldIdentity {
  readonly kind: "media";
  readonly description: string;
  readonly legacyPath?: readonly string[];
  /**
   * The block field that holds the human alt text. The renderer falls back to
   * it when the reference carries no alt, so the inspector resolves the preview
   * through the same field to stay visually faithful (FR-051).
   */
  readonly altPath?: readonly string[];
}

export type BlockFormField =
  | TextFieldConfig
  | TextAreaFieldConfig
  | UrlFieldConfig
  | SelectFieldConfig
  | MediaFieldConfig;

export interface BlockFormConfig {
  readonly fields: readonly BlockFormField[];
}

export type BlockProps = Record<string, unknown>;

const HERO_LINK_PATH = ["primaryCta"] as const;
const URL_PLACEHOLDER = "/pricing or https://example.com";
const HEADLINE_LABEL = "Headline";
const SUPPORTING_TEXT_LABEL = "Supporting text";
const PATH_HEADLINE = ["headline"] as const;
const PATH_SUBHEADLINE = ["subheadline"] as const;
const BRAND_NAME_LABEL = "Brand name";
const LOGO_LABEL = "Logo";
const IMAGE_LABEL = "Image";
const MEDIA_FIELD_DESCRIPTION =
  "Choose an image from the shared workspace library.";

export const BLOCK_FORM_CONFIGS = {
  hero: {
    fields: [
      { kind: "text", path: ["badge"], label: "Badge", placeholder: "New release", maxLength: 60 },
      { kind: "text", path: PATH_HEADLINE, label: HEADLINE_LABEL, placeholder: "Main heading", maxLength: 250 },
      { kind: "textarea", path: PATH_SUBHEADLINE, label: SUPPORTING_TEXT_LABEL, placeholder: "Supporting narrative", maxLength: 1_000, rows: 3 },
      { kind: "media", path: ["image"], label: IMAGE_LABEL, description: MEDIA_FIELD_DESCRIPTION, legacyPath: ["imageUrl"], altPath: ["imageAlt"] },
      { kind: "text", path: ["imageAlt"], label: "Image alt text", placeholder: "Describe the image", maxLength: 200 },
      { kind: "select", path: ["imagePosition"], label: "Image position", options: [
        { label: "Right", value: "right" },
        { label: "Left", value: "left" },
        { label: "Bottom", value: "bottom" },
        { label: "Background", value: "background" },
      ] },
      { kind: "text", path: [...HERO_LINK_PATH, "label"], label: "Primary button label", placeholder: "Book now", maxLength: 60 },
      { kind: "url", path: [...HERO_LINK_PATH, "target", "url"], label: "Primary button link", placeholder: URL_PLACEHOLDER },
      { kind: "text", path: ["secondaryCta", "label"], label: "Secondary button label", placeholder: "Learn more", maxLength: 60 },
      { kind: "url", path: ["secondaryCta", "target", "url"], label: "Secondary button link", placeholder: URL_PLACEHOLDER },
    ],
  },
  features: {
    fields: [
      { kind: "text", path: PATH_HEADLINE, label: HEADLINE_LABEL, placeholder: "What we offer", maxLength: 250 },
      { kind: "textarea", path: PATH_SUBHEADLINE, label: SUPPORTING_TEXT_LABEL, placeholder: "Why choose us", maxLength: 1_000, rows: 2 },
      { kind: "select", path: ["columns"], label: "Columns", options: [
        { label: "Two", value: "2" },
        { label: "Three", value: "3" },
        { label: "Four", value: "4" },
      ] },
    ],
  },
  pricing: {
    fields: [
      { kind: "text", path: PATH_HEADLINE, label: HEADLINE_LABEL, placeholder: "Transparent pricing", maxLength: 250 },
      { kind: "textarea", path: PATH_SUBHEADLINE, label: SUPPORTING_TEXT_LABEL, placeholder: "Choose a plan", maxLength: 1_000, rows: 2 },
    ],
  },
  form: {
    fields: [
      { kind: "text", path: PATH_HEADLINE, label: HEADLINE_LABEL, placeholder: "Get in touch", maxLength: 250 },
      { kind: "textarea", path: PATH_SUBHEADLINE, label: SUPPORTING_TEXT_LABEL, placeholder: "We reply within one day", maxLength: 1_000, rows: 2 },
      { kind: "text", path: ["submitButtonText"], label: "Submit button label", placeholder: "Send message", maxLength: 60 },
      { kind: "text", path: ["successMessage"], label: "Success message", placeholder: "Thank you — we will be in touch.", maxLength: 300 },
      { kind: "text", path: ["errorMessage"], label: "Error message", placeholder: "Please check the form and try again.", maxLength: 300 },
    ],
  },
  faq: {
    fields: [
      { kind: "text", path: PATH_HEADLINE, label: HEADLINE_LABEL, placeholder: "Frequently asked questions", maxLength: 250 },
      { kind: "textarea", path: PATH_SUBHEADLINE, label: SUPPORTING_TEXT_LABEL, placeholder: "Answers to common questions", maxLength: 1_000, rows: 2 },
    ],
  },
  "rich-text": {
    fields: [
      { kind: "textarea", path: ["contentHtml"], label: "HTML content", placeholder: "<p>Write your copy here.</p>", maxLength: 100_000, rows: 8 },
    ],
  },
  navbar: {
    fields: [
      { kind: "text", path: ["logoText"], label: BRAND_NAME_LABEL, placeholder: "Brand name", maxLength: 60 },
      { kind: "media", path: ["logo"], label: LOGO_LABEL, description: MEDIA_FIELD_DESCRIPTION, legacyPath: ["logoUrl"], altPath: ["logoText"] },
    ],
  },
  footer: {
    fields: [
      { kind: "text", path: ["logoText"], label: BRAND_NAME_LABEL, placeholder: "Brand name", maxLength: 60 },
      { kind: "media", path: ["logo"], label: LOGO_LABEL, description: MEDIA_FIELD_DESCRIPTION, legacyPath: ["logoUrl"], altPath: ["logoText"] },
      { kind: "text", path: ["copyrightText"], label: "Copyright notice", placeholder: "© 2026 Your company", maxLength: 120 },
    ],
  },
} as const satisfies Record<BlockType, BlockFormConfig>;

export function readProps(block: BlockAst): BlockProps {
  return block.props as unknown as BlockProps;
}

function readObject(value: unknown): BlockProps {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as BlockProps;
}

export function readFieldValue(props: BlockProps, path: readonly string[]): string {
  let current: unknown = props;
  for (const key of path) {
    current = readObject(current)[key];
  }
  if (typeof current === "string" || typeof current === "number" || typeof current === "boolean") {
    return String(current);
  }
  return "";
}

interface AssignAtInput {
  readonly source: BlockProps;
  readonly path: readonly string[];
  readonly value: unknown;
  readonly index: number;
}

function assignAt(input: AssignAtInput): BlockProps {
  const key = input.path[input.index];
  if (key === undefined) {
    return input.source;
  }
  const nextValue =
    input.index === input.path.length - 1
      ? input.value
      : assignAt({ ...input, source: readObject(input.source[key]), index: input.index + 1 });
  return { ...input.source, [key]: nextValue };
}

function coerceValue(previous: unknown, raw: string): string | number | boolean {
  if (typeof previous === "number") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : raw;
  }
  if (typeof previous === "boolean") {
    return raw === "true";
  }
  return raw;
}

export interface WriteFieldValueInput {
  readonly props: BlockProps;
  readonly path: readonly string[];
  readonly raw: string;
}

export function writeFieldValue(input: WriteFieldValueInput): BlockProps {
  const existing = input.path.reduce<unknown>((value, key) => readObject(value)[key], input.props);
  return assignAt({
    source: input.props,
    path: input.path,
    value: coerceValue(existing, input.raw),
    index: 0,
  });
}

function removeAt(input: {
  readonly props: BlockProps;
  readonly path: readonly string[];
  readonly index: number;
}): BlockProps {
  const key = input.path[input.index];
  if (key === undefined) {
    return input.props;
  }
  if (input.index === input.path.length - 1) {
    const next = { ...input.props };
    delete next[key];
    return next;
  }
  return {
    ...input.props,
    [key]: removeAt({
      props: readObject(input.props[key]),
      path: input.path,
      index: input.index + 1,
    }),
  };
}

export interface WriteMediaReferenceInput {
  readonly props: BlockProps;
  readonly path: readonly string[];
  readonly legacyPath: readonly string[] | undefined;
  readonly reference: MediaReference;
}

/** Stores the asset identity and drops any copied legacy URL in one edit. */
export function writeMediaReference(input: WriteMediaReferenceInput): BlockProps {
  const withReference = assignAt({
    source: input.props,
    path: input.path,
    value: input.reference,
    index: 0,
  });
  if (input.legacyPath === undefined) {
    return withReference;
  }
  return removeAt({ props: withReference, path: input.legacyPath, index: 0 });
}

export interface ClearMediaReferenceInput {
  readonly props: BlockProps;
  readonly path: readonly string[];
  readonly legacyPath: readonly string[] | undefined;
}

export function clearMediaReference(input: ClearMediaReferenceInput): BlockProps {
  const withoutReference = removeAt({
    props: input.props,
    path: input.path,
    index: 0,
  });
  if (input.legacyPath === undefined) {
    return withoutReference;
  }
  return removeAt({ props: withoutReference, path: input.legacyPath, index: 0 });
}

function readPathValue(props: BlockProps, path: readonly string[]): unknown {
  return path.reduce<unknown>((value, key) => readObject(value)[key], props);
}

/** Parses the stored media slot; an unknown shape is treated as absent. */
export function readMediaReference(
  props: BlockProps,
  path: readonly string[]
): MediaReference | null {
  const parsed = MediaReferenceSchema.safeParse(readPathValue(props, path));
  return parsed.success ? parsed.data : null;
}

export function readOptionalString(
  props: BlockProps,
  path: readonly string[]
): string | null {
  const value = readPathValue(props, path);
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Validates the whole candidate block against the production AST schema, so the
 * inspector cannot drift from what the renderer and the API accept (FR-024).
 */
export function blockFormErrors(block: BlockAst, props: BlockProps): Record<string, string> {
  const parsed = BlockAstSchema.safeParse({ ...block, props });
  if (parsed.success) {
    return {};
  }
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const issuePath = issue.path[0] === "props" ? issue.path.slice(1) : issue.path;
    const key = issuePath.length === 0 ? "_form" : issuePath.join(".");
    errors[key] ??= issue.message;
  }
  return errors;
}

export function fieldError(errors: Record<string, string>, path: readonly string[]): string | null {
  return errors[path.join(".")] ?? null;
}
