import type { BlockType, BlockAst, SectionAst } from "../../ast/types.js";

export interface BlockBlueprint {
  type: BlockType;
  title: string;
  description: string;
  category: "marketing" | "commerce" | "content" | "navigation";
  createDefaultBlock: (id: string) => BlockAst;
}

export interface SectionBlueprint {
  title: string;
  description: string;
  createDefaultSection: (sectionId: string, blockId: string) => SectionAst;
}

export interface BlockTreeSidebarProps {
  sections: SectionAst[];
  selectedSectionId: string | null;
  selectedBlockId: string | null;
  onSelectSection: (sectionId: string) => void;
  onSelectBlock: (blockId: string, sectionId: string) => void;
  onMoveSection: (fromIndex: number, toIndex: number) => void;
  onDeleteSection: (sectionId: string) => void;
  onToggleSectionVisibility: (sectionId: string) => void;
  onOpenAddDrawer: (targetSectionIndex?: number) => void;
  className?: string;
}

export interface AddBlockDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBlock: (block: BlockAst, targetSectionId?: string) => void;
  onAddSection: (section: SectionAst) => void;
  targetSectionId?: string | null;
  className?: string;
}
