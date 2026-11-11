import { z } from "zod";
import {
  BlockAstSchema,
  PageAstSchema,
  type BlockAst,
  type BlockType,
  type PageAst,
} from "@suite/website-builder/ast";
import { BLOCK_BLUEPRINTS } from "@suite/website-builder/editor";
import {
  CATALOG_ITEM_KINDS,
  type CatalogItem,
  type CatalogItemKind,
  type CatalogTargeting,
  type CreateCatalogItemBody,
  type UpdateCatalogItemBody,
} from "./catalog-api";
import { readPath } from "./catalog-paths";

/**
 * The authoring schemas for catalog item definitions. They mirror the P-03 API
 * contract and reuse the production AST schemas, so the generated form and the
 * JSON tab validate through exactly one code path (FR-147, FR-148).
 */

export const CATALOG_CONTRACT_VERSION = "2026-03" as const;

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9][a-z0-9_-]*$/,
    "Use a lower-case slug: letters, digits, underscore or hyphen.",
  );

const contractVersionSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(
    /^\d{4}-\d{2}$/,
    "Contract version must be a YYYY-MM reference such as 2026-03.",
  );

const flagKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9_.-]+$/,
    "Flag key must be lowercase letters, digits, dots, underscores or hyphens.",
  );

const targetingSchema = z
  .object({
    plans: z.array(slugSchema).max(50),
    industries: z.array(slugSchema).max(50),
    orgAllowlist: z.array(z.string().min(1).max(64)).max(200),
    orgDenylist: z.array(z.string().min(1).max(64)).max(200),
  })
  .strict();

const sectionDefinitionSchema = z
  .object({
    schemaVersion: contractVersionSchema,
    block: BlockAstSchema,
  })
  .strict();

const templateDefinitionSchema = z
  .object({
    schemaVersion: contractVersionSchema,
    pages: z.array(PageAstSchema).min(1).max(20),
  })
  .strict();

const BLOCKED_TOKEN_KEY = /^(?:__proto__|prototype|constructor)$/;

function unsafeTokenIssues(definition: Record<string, unknown>): CatalogIssue[] {
  const tokens = definition.tokens;
  if (typeof tokens !== "object" || tokens === null || Array.isArray(tokens)) {
    return [];
  }
  return Object.keys(tokens)
    .filter((key) => BLOCKED_TOKEN_KEY.test(key))
    .map((key) => ({
      path: `definition.tokens.${key}`,
      message: "A theme token key cannot be a reserved object property.",
    }));
}

const themeTokensSchema = z
  .record(z.union([z.string().max(200), z.number()]))
  .refine(
    (tokens) => Object.keys(tokens).every((key) => !BLOCKED_TOKEN_KEY.test(key)),
    { message: "A theme token key cannot be a reserved object property." },
  );

const themeDefinitionSchema = z
  .object({
    schemaVersion: contractVersionSchema,
    tokens: themeTokensSchema,
  })
  .strict();

const DEFINITION_SCHEMAS = {
  SECTION: sectionDefinitionSchema,
  TEMPLATE: templateDefinitionSchema,
  THEME: themeDefinitionSchema,
} as const satisfies Record<CatalogItemKind, z.ZodTypeAny>;

export const catalogDraftSchema = z
  .object({
    kind: z.enum(CATALOG_ITEM_KINDS),
    name: z.string().trim().min(1).max(191),
    slug: slugSchema,
    category: slugSchema,
    industries: z.array(slugSchema).max(50),
    contractVersion: contractVersionSchema,
    flagKey: flagKeySchema.nullable(),
    targeting: targetingSchema,
    definition: z.record(z.unknown()),
  })
  .strict();

export type CatalogDraft = z.infer<typeof catalogDraftSchema>;
export type SectionCatalogDefinition = z.infer<typeof sectionDefinitionSchema>;
export type TemplateCatalogDefinition = z.infer<typeof templateDefinitionSchema>;
export type ThemeCatalogDefinition = z.infer<typeof themeDefinitionSchema>;

export interface CatalogIssue {
  readonly path: string;
  readonly message: string;
}

export type CatalogDraftValidation =
  | { readonly ok: true; readonly draft: CatalogDraft }
  | { readonly ok: false; readonly issues: readonly CatalogIssue[] };

export type ParsedCatalogDefinition =
  | { readonly kind: "SECTION"; readonly definition: SectionCatalogDefinition }
  | { readonly kind: "TEMPLATE"; readonly definition: TemplateCatalogDefinition }
  | { readonly kind: "THEME"; readonly definition: ThemeCatalogDefinition };

export type ParsedDefinitionResult =
  | { readonly ok: true; readonly parsed: ParsedCatalogDefinition }
  | { readonly ok: false; readonly issues: readonly CatalogIssue[] };

function issuePath(issue: z.ZodIssue): string {
  return issue.path.map((segment) => String(segment)).join(".");
}

/** Maps Zod issues (including undeclared keys) onto field paths. */
export function catalogIssues(error: z.ZodError): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        const path = [...issue.path.map(String), key].join(".");
        issues.push({ path, message: `Undeclared property "${key}".` });
      }
      continue;
    }
    issues.push({ path: issuePath(issue), message: issue.message });
  }
  return issues;
}

function prefixedIssues(prefix: string, issues: readonly CatalogIssue[]): CatalogIssue[] {
  return issues.map((issue) => ({
    path: issue.path === "" ? prefix : `${prefix}.${issue.path}`,
    message: issue.message,
  }));
}

/**
 * The one validation path shared by the generated form, the JSON tab, the save
 * button and the preview surface. Unknown properties are rejected at every
 * level because every object schema is strict.
 */
export function validateCatalogDraft(
  kind: CatalogItemKind,
  input: unknown,
): CatalogDraftValidation {
  const base = catalogDraftSchema.safeParse(input);
  if (!base.success) {
    return { ok: false, issues: catalogIssues(base.error) };
  }
  if (base.data.kind !== kind) {
    return {
      ok: false,
      issues: [{ path: "kind", message: "The catalog kind is immutable." }],
    };
  }
  const unsafe = unsafeTokenIssues(base.data.definition);
  if (unsafe.length > 0) {
    return { ok: false, issues: unsafe };
  }
  const definition = DEFINITION_SCHEMAS[kind].safeParse(base.data.definition);
  if (!definition.success) {
    return {
      ok: false,
      issues: prefixedIssues("definition", catalogIssues(definition.error)),
    };
  }
  const parsedDefinition = z.record(z.unknown()).parse(definition.data);
  return { ok: true, draft: { ...base.data, definition: parsedDefinition } };
}

/** Validates a stored definition before the production renderer sees it. */
export function parseCatalogDefinition(
  kind: CatalogItemKind,
  definition: Record<string, unknown>,
): ParsedDefinitionResult {
  const unsafe = unsafeTokenIssues(definition);
  if (unsafe.length > 0) {
    return { ok: false, issues: unsafe };
  }
  switch (kind) {
    case "SECTION": {
      const result = sectionDefinitionSchema.safeParse(definition);
      return result.success
        ? { ok: true, parsed: { kind, definition: result.data } }
        : { ok: false, issues: catalogIssues(result.error) };
    }
    case "TEMPLATE": {
      const result = templateDefinitionSchema.safeParse(definition);
      return result.success
        ? { ok: true, parsed: { kind, definition: result.data } }
        : { ok: false, issues: catalogIssues(result.error) };
    }
    case "THEME": {
      const result = themeDefinitionSchema.safeParse(definition);
      return result.success
        ? { ok: true, parsed: { kind, definition: result.data } }
        : { ok: false, issues: catalogIssues(result.error) };
    }
  }
}

export function isBlockType(value: string): value is BlockType {
  return Object.prototype.hasOwnProperty.call(BLOCK_BLUEPRINTS, value);
}

/** The section types the production blueprint registry declares. */
export const CATALOG_BLOCK_TYPES: readonly BlockType[] = Object.keys(
  BLOCK_BLUEPRINTS,
).filter(isBlockType);

export function seedBlock(type: BlockType): BlockAst {
  return BLOCK_BLUEPRINTS[type].createDefaultBlock("blk_seed");
}

function seedTemplatePage(): PageAst {
  return {
    version: 1,
    schemaVersion: CATALOG_CONTRACT_VERSION,
    sections: [{ id: "sec_seed", blocks: [BLOCK_BLUEPRINTS.hero.createDefaultBlock("blk_hero")] }],
  };
}

function seedDefinition(kind: CatalogItemKind): Record<string, unknown> {
  switch (kind) {
    case "SECTION":
      return { schemaVersion: CATALOG_CONTRACT_VERSION, block: seedBlock("hero") };
    case "TEMPLATE":
      return { schemaVersion: CATALOG_CONTRACT_VERSION, pages: [seedTemplatePage()] };
    case "THEME":
      return { schemaVersion: CATALOG_CONTRACT_VERSION, tokens: {} };
  }
}

export const EMPTY_CATALOG_TARGETING: CatalogTargeting = {
  plans: [],
  industries: [],
  orgAllowlist: [],
  orgDenylist: [],
};

/** A new draft starts from the production blueprint for its kind. */
export function createCatalogDraft(kind: CatalogItemKind): CatalogDraft {
  return {
    kind,
    name: "",
    slug: "",
    category: "",
    industries: [],
    contractVersion: CATALOG_CONTRACT_VERSION,
    flagKey: null,
    targeting: EMPTY_CATALOG_TARGETING,
    definition: seedDefinition(kind),
  };
}

export function draftFromItem(item: CatalogItem): CatalogDraft {
  return {
    kind: item.kind,
    name: item.name,
    slug: item.slug,
    category: item.category,
    industries: item.industries,
    contractVersion: item.contractVersion,
    flagKey: item.flagKey,
    targeting: item.targeting,
    definition: item.definition,
  };
}

/** The validated section type of a draft, or null when it is unreadable. */
export function catalogBlockType(draft: CatalogDraft): BlockType | null {
  if (draft.kind !== "SECTION") {
    return null;
  }
  const value = readPath(draft, "definition.block.type");
  return typeof value === "string" && isBlockType(value) ? value : null;
}

export function toCreateCatalogItemBody(draft: CatalogDraft): CreateCatalogItemBody {
  return {
    kind: draft.kind,
    name: draft.name,
    slug: draft.slug,
    category: draft.category,
    industries: draft.industries,
    contractVersion: draft.contractVersion,
    flagKey: draft.flagKey,
    targeting: draft.targeting,
    definition: draft.definition,
  };
}

export function toUpdateCatalogItemBody(
  draft: CatalogDraft,
  expectedVersion: number,
): UpdateCatalogItemBody {
  return {
    expectedVersion,
    name: draft.name,
    slug: draft.slug,
    category: draft.category,
    industries: draft.industries,
    contractVersion: draft.contractVersion,
    flagKey: draft.flagKey,
    targeting: draft.targeting,
    definition: draft.definition,
  };
}

export function serializeCatalogDraft(draft: CatalogDraft): string {
  return JSON.stringify(draft, null, 2);
}
