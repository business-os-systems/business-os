import type { MediaAssetMap, PageAst } from "@suite/website-builder/ast";
import type { AppearanceTokens } from "@suite/website-builder/appearance";

export type PreviewDevice = "desktop" | "tablet" | "mobile" | "responsive";

export interface PreviewWorkspaceProps {
  siteId: string;
  pageId: string;
  pageTitle?: string;
  initialAst?: PageAst;
  media?: MediaAssetMap;
  tokens?: AppearanceTokens | null;
}

export interface PreviewHeaderProps {
  siteId: string;
  pageId: string;
  pageTitle: string;
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
}
