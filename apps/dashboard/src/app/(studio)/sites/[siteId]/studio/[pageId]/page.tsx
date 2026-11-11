import React from "react";
import { hasPermission, PERMISSIONS } from "@suite/core";
import { requireAuth } from "@/lib/auth-guard";
import { StudioWorkspace } from "@/components/studio/studio-workspace";

export default async function StudioPage({
  params,
}: {
  params: Promise<{ siteId: string; pageId: string }>;
}) {
  const session = await requireAuth();
  const { siteId, pageId } = await params;
  const canWrite = hasPermission(
    session.permissions ?? [],
    PERMISSIONS.WEBSITE_BUILDER.PAGES_WRITE
  );
  return (
    <StudioWorkspace
      siteId={siteId}
      pageId={pageId}
      canWrite={canWrite}
      userPermissions={session.permissions ?? []}
      currentUserId={session.userId}
      currentUserName={session.userName}
    />
  );
}
