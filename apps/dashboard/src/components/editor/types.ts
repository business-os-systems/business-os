import type { PageAst } from "@suite/website-builder/ast";
import type { ICmsApiClient } from "../../lib/api";

export type AutosaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

export interface StudioWorkspaceProps {
  organizationId?: string;
  siteId: string;
  pageId: string;
  pageTitle?: string;
  initialAst?: PageAst;
  initialRevision?: number;
  revision?: number;
  status?: "DRAFT" | "PUBLISHED";
  cmsClient?: ICmsApiClient;
}

export interface StudioHeaderProps {
  siteId: string;
  pageId: string;
  pageTitle: string;
  revision: number;
  status: "DRAFT" | "PUBLISHED";
  autosaveStatus?: AutosaveStatus;
  isLayersOpen: boolean;
  isInspectorOpen: boolean;
  onToggleLayers: () => void;
  onToggleInspector: () => void;
  onOpenAddDrawer: () => void;
  onFlushSave?: () => void;
  onPublish?: () => void;
  isPublishing?: boolean;
  versionsCount?: number;
}
