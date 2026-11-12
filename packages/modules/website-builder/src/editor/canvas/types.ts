import type { MediaAssetMap, PageAst } from "../../ast/types.js";

export type ViewportDevice = "mobile" | "tablet" | "desktop";

export interface ViewportConfig {
  readonly device: ViewportDevice;
  readonly width: number;
  readonly label: string;
}

/**
 * Selection is a discriminated union rather than three nullable ids so a block
 * selection always carries its section and `none` cannot be half-set.
 */
export type CanvasSelection =
  | { readonly kind: "none" }
  | { readonly kind: "section"; readonly sectionId: string }
  | { readonly kind: "block"; readonly sectionId: string; readonly blockId: string };

export const NO_SELECTION: CanvasSelection = { kind: "none" };

export function selectSection(sectionId: string): CanvasSelection {
  return { kind: "section", sectionId };
}

export function selectBlock(sectionId: string, blockId: string): CanvasSelection {
  return { kind: "block", sectionId, blockId };
}

export function selectedSectionId(selection: CanvasSelection): string | null {
  if (selection.kind === "none") {
    return null;
  }
  return selection.sectionId;
}

export function selectedBlockId(selection: CanvasSelection): string | null {
  return selection.kind === "block" ? selection.blockId : null;
}

export function isSectionSelected(selection: CanvasSelection, sectionId: string): boolean {
  return selection.kind !== "none" && selection.sectionId === sectionId;
}

export function isBlockSelected(selection: CanvasSelection, blockId: string): boolean {
  return selection.kind === "block" && selection.blockId === blockId;
}

export interface VisualCanvasProps {
  readonly ast: PageAst;
  readonly device: ViewportDevice;
  readonly zoom: number;
  readonly selection: CanvasSelection;
  readonly readOnly: boolean;
  readonly onSelect: (selection: CanvasSelection) => void;
  readonly onZoomChange: (zoom: number) => void;
  readonly onOpenCatalog: () => void;
  readonly media?: MediaAssetMap;
}
