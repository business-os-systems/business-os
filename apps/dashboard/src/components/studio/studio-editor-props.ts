import type { AutosaveStatus, ViewportDevice } from "@suite/website-builder/editor";
import type { CmsPageDto, CmsSiteDto } from "@/lib/api/site-client";

/**
 * The editor's contribution to the one studio top bar. The canvas owns the save
 * loop; the shell owns the chrome, so the two state machines meet here instead
 * of in a second header (FR-101).
 */
export interface StudioEditorToolbar {
  readonly status: AutosaveStatus;
  readonly revision: number;
  readonly error: string | null;
  readonly onSaveNow: () => void;
  readonly onAddSection: () => void;
}

export interface StudioViewport {
  readonly device: ViewportDevice;
  readonly zoom: number;
  readonly onDeviceChange: (device: ViewportDevice) => void;
  readonly onZoomChange: (zoom: number) => void;
}

export interface StudioEditorProps extends StudioViewport {
  readonly site: CmsSiteDto;
  readonly page: CmsPageDto;
  readonly canWrite: boolean;
  readonly userPermissions: readonly string[];
  readonly currentUserId: string;
  readonly currentUserName: string;
  readonly onToolbarChange: (toolbar: StudioEditorToolbar) => void;
}
