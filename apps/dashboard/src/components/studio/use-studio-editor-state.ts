"use client";

import { useState } from "react";
import type { BlockAst, PageAst, SectionAst } from "@suite/website-builder/ast";
import {
  deleteBlock,
  deleteSection,
  duplicateBlock,
  duplicateSection,
  insertCatalogBlock,
  moveBlock,
  moveSection,
  NO_SELECTION,
  updateBlockProps,
  type CanvasSelection,
  type CatalogSection,
  type MoveDirection,
  type ViewportDevice,
} from "@suite/website-builder/editor";

export interface CanvasViewState {
  readonly selection: CanvasSelection;
  readonly device: ViewportDevice;
  readonly zoom: number;
  readonly isDrawerOpen: boolean;
  readonly setSelection: (selection: CanvasSelection) => void;
  readonly setDevice: (device: ViewportDevice) => void;
  readonly setZoom: (zoom: number) => void;
  readonly openDrawer: () => void;
  readonly closeDrawer: () => void;
}

export interface ControlledViewport {
  readonly device: ViewportDevice;
  readonly zoom: number;
  readonly setDevice: (device: ViewportDevice) => void;
  readonly setZoom: (zoom: number) => void;
}

/**
 * Selection and the catalog drawer stay local to the editor; device and zoom
 * are controlled by the studio top bar so one control surface owns them
 * (FR-101).
 */
export function useCanvasViewState(viewport: ControlledViewport): CanvasViewState {
  const [selection, setSelection] = useState<CanvasSelection>(NO_SELECTION);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  return {
    selection,
    device: viewport.device,
    zoom: viewport.zoom,
    isDrawerOpen,
    setSelection,
    setDevice: viewport.setDevice,
    setZoom: viewport.setZoom,
    openDrawer: () => setIsDrawerOpen(true),
    closeDrawer: () => setIsDrawerOpen(false),
  };
}

export interface AstMutations {
  readonly changeBlockProps: (blockId: string, props: Record<string, unknown>) => void;
  readonly moveBlockById: (blockId: string, direction: MoveDirection) => void;
  readonly duplicateActiveBlock: () => void;
  readonly deleteActiveBlock: () => void;
  readonly moveSectionById: (sectionId: string, direction: MoveDirection) => void;
  readonly duplicateActiveSection: () => void;
  readonly deleteSectionById: (sectionId: string) => void;
  readonly insertCatalog: (section: CatalogSection) => void;
}

export interface AstMutationInput {
  readonly ast: PageAst;
  readonly section: SectionAst | null;
  readonly block: BlockAst | null;
  readonly updateAst: (ast: PageAst) => void;
  readonly clearSelection: () => void;
  readonly closeDrawer: () => void;
}

export function useAstMutations(input: AstMutationInput): AstMutations {
  const { ast, section, block, updateAst } = input;
  const changeBlockProps = (blockId: string, props: Record<string, unknown>) => {
    updateAst(updateBlockProps({ ast, blockId, props }));
  };
  const moveBlockById = (blockId: string, direction: MoveDirection) => {
    if (section !== null) {
      updateAst(moveBlock({ ast, sectionId: section.id, blockId, direction }));
    }
  };
  const duplicateActiveBlock = () => {
    if (section !== null && block !== null) {
      updateAst(duplicateBlock({ ast, sectionId: section.id, blockId: block.id }));
    }
  };
  const deleteActiveBlock = () => {
    if (section !== null && block !== null) {
      updateAst(deleteBlock({ ast, sectionId: section.id, blockId: block.id }));
      input.clearSelection();
    }
  };
  const moveSectionById = (sectionId: string, direction: MoveDirection) => {
    updateAst(moveSection({ ast, sectionId, direction }));
  };
  const duplicateActiveSection = () => {
    if (section !== null) {
      updateAst(duplicateSection({ ast, sectionId: section.id }));
    }
  };
  const deleteSectionById = (sectionId: string) => {
    updateAst(deleteSection({ ast, sectionId }));
    input.clearSelection();
  };
  const insertCatalog = (catalogSection: CatalogSection) => {
    updateAst(insertCatalogBlock({ ast, block: catalogSection.definition.block, name: catalogSection.name }));
    input.closeDrawer();
    input.clearSelection();
  };
  return {
    changeBlockProps,
    moveBlockById,
    duplicateActiveBlock,
    deleteActiveBlock,
    moveSectionById,
    duplicateActiveSection,
    deleteSectionById,
    insertCatalog,
  };
}
