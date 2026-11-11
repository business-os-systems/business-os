import type { ReactNode } from "react";
import type { MediaAssetView, MediaClient } from "@suite/media/react";
import type { BlockAst, MediaAssetMap, SectionAst } from "../../ast/types.js";

export type MoveDirection = "up" | "down";

/**
 * The host application supplies its transport, capability claims and the
 * resolved asset map. The inspector never constructs a media client itself,
 * which keeps the studio and the picker app-agnostic (FR-119, FR-123).
 */
export interface MediaPickerControls {
  readonly client: MediaClient;
  readonly userPermissions: readonly string[];
  readonly assets: MediaAssetMap;
  readonly onAssetSelected: (asset: MediaAssetView) => void;
}

export interface BlockPropertyInspectorProps {
  readonly block: BlockAst | null;
  readonly section: SectionAst | null;
  readonly canWrite: boolean;
  readonly media: MediaPickerControls | null;
  readonly onChangeBlockProps: (blockId: string, props: Record<string, unknown>) => void;
  readonly onMoveBlock: (blockId: string, direction: MoveDirection) => void;
  readonly onDuplicateBlock: (blockId: string) => void;
  readonly onDeleteBlock: (blockId: string) => void;
  readonly onMoveSection: (sectionId: string, direction: MoveDirection) => void;
  readonly onDuplicateSection: (sectionId: string) => void;
  readonly onDeleteSection: (sectionId: string) => void;
  readonly footer: ReactNode;
}
