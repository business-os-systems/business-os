import type { CmsPageDto, CmsSiteDto } from "@/lib/api/site-client";

export interface StudioEditorProps {
  readonly site: CmsSiteDto;
  readonly page: CmsPageDto;
  readonly canWrite: boolean;
  readonly userPermissions: readonly string[];
  readonly currentUserId: string;
  readonly currentUserName: string;
}
