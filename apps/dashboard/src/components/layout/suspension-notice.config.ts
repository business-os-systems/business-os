import type { BlockingTenantStatus } from "@suite/core";

export interface SuspensionNoticeCopy {
  readonly heading: string;
  readonly detail: string;
}

/** Presentation copy for a blocked workspace; the layout selects by status. */
export const SUSPENSION_NOTICE_COPY: Readonly<
  Record<BlockingTenantStatus, SuspensionNoticeCopy>
> = {
  SUSPENDED: {
    heading: "This workspace is suspended",
    detail:
      "Access is paused for every member of this workspace. Your data is retained and will be available again as soon as the workspace is restored.",
  },
  ARCHIVED: {
    heading: "This workspace is archived",
    detail:
      "This workspace has been closed and its data is no longer accessible to your team. Contact platform support if the workspace should be restored.",
  },
};
