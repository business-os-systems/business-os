import type { PageAst } from "@suite/website-builder/ast";

export type PreviewDevice = "desktop" | "tablet" | "mobile" | "responsive";

export interface PreviewWorkspaceProps {
  siteId: string;
  pageId: string;
  pageTitle?: string;
  initialAst?: PageAst;
}

export interface PreviewHeaderProps {
  siteId: string;
  pageId: string;
  pageTitle: string;
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
}
