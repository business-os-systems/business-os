import { BlockAstSchema } from "../ast/schema.js";
import type { BlockAst, PageAst, SectionAst } from "../ast/types.js";

export type EditorMoveDirection = "up" | "down";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createEditorId(kind: "section" | "block"): string {
  const prefix = kind === "section" ? "sec_" : "blk_";
  return prefix + globalThis.crypto.randomUUID();
}

function regenerateIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(regenerateIds);
  }
  if (!isRecord(value)) {
    return value;
  }
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    next[key] = key === "id" && typeof entry === "string" ? createEditorId("block") : regenerateIds(entry);
  }
  return next;
}

function cloneBlock(block: BlockAst): BlockAst {
  return BlockAstSchema.parse(regenerateIds(block));
}

function cloneSection(section: SectionAst): SectionAst {
  return { ...section, id: createEditorId("section"), blocks: section.blocks.map(cloneBlock) };
}

interface MoveItemInput<T> {
  readonly items: readonly T[];
  readonly index: number;
  readonly direction: EditorMoveDirection;
}

function moveItem<T>(input: MoveItemInput<T>): T[] {
  const target = input.direction === "up" ? input.index - 1 : input.index + 1;
  if (input.index < 0 || input.index >= input.items.length || target < 0 || target >= input.items.length) {
    return [...input.items];
  }
  const next = [...input.items];
  const currentItem = next[input.index];
  const targetItem = next[target];
  if (currentItem === undefined || targetItem === undefined) {
    return next;
  }
  next[input.index] = targetItem;
  next[target] = currentItem;
  return next;
}

function mapSections(ast: PageAst, mapper: (section: SectionAst) => SectionAst): PageAst {
  return { ...ast, sections: ast.sections.map(mapper) };
}

export interface UpdateBlockPropsInput {
  readonly ast: PageAst;
  readonly blockId: string;
  readonly props: Record<string, unknown>;
}

export function updateBlockProps(input: UpdateBlockPropsInput): PageAst {
  return mapSections(input.ast, (section) => ({
    ...section,
    blocks: section.blocks.map((block) => {
      if (block.id !== input.blockId) {
        return block;
      }
      const parsed = BlockAstSchema.safeParse({ ...block, props: input.props });
      return parsed.success ? parsed.data : block;
    }),
  }));
}

export interface InsertCatalogBlockInput {
  readonly ast: PageAst;
  readonly block: BlockAst;
  readonly name: string;
}

export function insertCatalogBlock(input: InsertCatalogBlockInput): PageAst {
  const section: SectionAst = {
    id: createEditorId("section"),
    name: input.name,
    blocks: [cloneBlock(input.block)],
  };
  return { ...input.ast, sections: [...input.ast.sections, section] };
}

export interface MoveSectionInput {
  readonly ast: PageAst;
  readonly sectionId: string;
  readonly direction: EditorMoveDirection;
}

export function moveSection(input: MoveSectionInput): PageAst {
  const index = input.ast.sections.findIndex((section) => section.id === input.sectionId);
  return { ...input.ast, sections: moveItem({ items: input.ast.sections, index, direction: input.direction }) };
}

export interface SectionTargetInput {
  readonly ast: PageAst;
  readonly sectionId: string;
}

export function deleteSection(input: SectionTargetInput): PageAst {
  return { ...input.ast, sections: input.ast.sections.filter((section) => section.id !== input.sectionId) };
}

export function duplicateSection(input: SectionTargetInput): PageAst {
  const index = input.ast.sections.findIndex((section) => section.id === input.sectionId);
  const source = input.ast.sections[index];
  if (source === undefined) {
    return input.ast;
  }
  const next = [...input.ast.sections];
  next.splice(index + 1, 0, cloneSection(source));
  return { ...input.ast, sections: next };
}

interface MapBlocksInput {
  readonly ast: PageAst;
  readonly sectionId: string;
  readonly mapper: (blocks: readonly BlockAst[]) => BlockAst[];
}

function mapSectionBlocks(input: MapBlocksInput): PageAst {
  return mapSections(input.ast, (section) =>
    section.id === input.sectionId ? { ...section, blocks: input.mapper(section.blocks) } : section
  );
}

export interface MoveBlockInput extends SectionTargetInput {
  readonly blockId: string;
  readonly direction: EditorMoveDirection;
}

export function moveBlock(input: MoveBlockInput): PageAst {
  return mapSectionBlocks({
    ast: input.ast,
    sectionId: input.sectionId,
    mapper: (blocks) => {
      const index = blocks.findIndex((block) => block.id === input.blockId);
      return moveItem({ items: blocks, index, direction: input.direction });
    },
  });
}

export interface BlockTargetInput extends SectionTargetInput {
  readonly blockId: string;
}

export function deleteBlock(input: BlockTargetInput): PageAst {
  return mapSectionBlocks({
    ast: input.ast,
    sectionId: input.sectionId,
    mapper: (blocks) => blocks.filter((block) => block.id !== input.blockId),
  });
}

export function duplicateBlock(input: BlockTargetInput): PageAst {
  return mapSectionBlocks({
    ast: input.ast,
    sectionId: input.sectionId,
    mapper: (blocks) => {
      const index = blocks.findIndex((block) => block.id === input.blockId);
      const source = blocks[index];
      if (source === undefined) {
        return [...blocks];
      }
      const next = [...blocks];
      next.splice(index + 1, 0, cloneBlock(source));
      return next;
    },
  });
}
