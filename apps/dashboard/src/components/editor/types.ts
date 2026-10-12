import type { PageAst } from "@suite/website-builder/ast";

export interface StudioWorkspaceProps {
  siteId: string;
  pageId: string;
  pageTitle?: string;
  initialAst?: PageAst;
  revision?: number;
  status?: "DRAFT" | "PUBLISHED";
}

export interface StudioHeaderProps {
  siteId: string;
  pageId: string;
  pageTitle: string;
  revision: number;
  status: "DRAFT" | "PUBLISHED";
  isLayersOpen: boolean;
  isInspectorOpen: boolean;
  onToggleLayers: () => void;
  onToggleInspector: () => void;
  onOpenAddDrawer: () => void;
}
