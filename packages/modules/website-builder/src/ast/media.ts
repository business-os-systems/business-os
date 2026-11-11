import type { BlockAst, MediaReference, PageAst } from "./types.js";

/** One asset reference found in an AST, with the location that owns it. */
export interface MediaReferenceLocation {
  readonly assetId: string;
  readonly blockId: string;
  readonly field: "image" | "logo";
  readonly alt: string | null;
}

function mediaReferenceOf(block: BlockAst): {
  readonly field: "image" | "logo";
  readonly reference: MediaReference | undefined;
} | null {
  switch (block.type) {
    case "hero":
      return { field: "image", reference: block.props.image };
    case "navbar":
      return { field: "logo", reference: block.props.logo };
    case "footer":
      return { field: "logo", reference: block.props.logo };
    case "features":
    case "pricing":
    case "form":
    case "faq":
    case "rich-text":
      return null;
  }
}

/**
 * Walks a page AST and reports every asset identity it references. The walk is
 * the single source both draft saving and publishing use to register usages,
 * so the two paths can never disagree (FR-120).
 */
export function collectMediaReferences(ast: PageAst): MediaReferenceLocation[] {
  const references: MediaReferenceLocation[] = [];
  for (const section of ast.sections) {
    for (const block of section.blocks) {
      const slot = mediaReferenceOf(block);
      if (slot === null || slot.reference?.kind !== "asset") {
        continue;
      }
      references.push({
        assetId: slot.reference.assetId,
        blockId: block.id,
        field: slot.field,
        alt: slot.reference.alt ?? null,
      });
    }
  }
  return references;
}

/** Unique asset ids referenced by the page, in first-seen order. */
export function collectMediaAssetIds(ast: PageAst): string[] {
  const ids = new Set<string>();
  for (const reference of collectMediaReferences(ast)) {
    ids.add(reference.assetId);
  }
  return [...ids];
}
