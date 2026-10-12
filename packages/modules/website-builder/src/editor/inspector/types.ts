import type { BlockAst, SectionAst, LinkTarget, BlockStyleTokens } from "../../ast/types.js";

export interface InspectorState {
  activeBlock: BlockAst | null;
  activeSection: SectionAst | null;
}

export interface BlockPropertyInspectorProps {
  block: BlockAst | null;
  section?: SectionAst | null;
  onChangeBlockProps: (blockId: string, updatedProps: Record<string, unknown>) => void;
  onChangeBlockStyles: (blockId: string, updatedStyles: BlockStyleTokens) => void;
  onClose?: () => void;
  className?: string;
}

export interface LinkTargetConfiguratorProps {
  label?: string;
  target: LinkTarget | undefined;
  onChange: (updatedTarget: LinkTarget) => void;
  className?: string;
}

export interface DesignTokenEditorProps {
  styles: BlockStyleTokens | undefined;
  onChange: (updatedStyles: BlockStyleTokens) => void;
  className?: string;
}
