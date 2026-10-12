import type { PageAst, SectionAst, BlockAst } from "../../ast/types.js";

export type ViewportDevice = "mobile" | "tablet" | "desktop";

export interface ViewportConfig {
  device: ViewportDevice;
  width: number;
  label: string;
}

export interface CanvasSelectionState {
  selectedBlockId: string | null;
  hoveredBlockId: string | null;
  selectedSectionId: string | null;
}

export interface VisualCanvasProps {
  ast: PageAst;
  device?: ViewportDevice;
  zoom?: number;
  selection?: CanvasSelectionState;
  onSelectBlock?: (blockId: string | null, block?: BlockAst) => void;
  onHoverBlock?: (blockId: string | null) => void;
  onSelectSection?: (sectionId: string | null, section?: SectionAst) => void;
  onDeviceChange?: (device: ViewportDevice) => void;
  onZoomChange?: (zoom: number) => void;
  className?: string;
  readOnly?: boolean;
}
