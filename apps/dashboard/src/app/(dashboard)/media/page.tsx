import React from "react";
import { PERMISSIONS, hasPermission } from "@suite/core";
import { requireAuth } from "@/lib/auth-guard";
import { MediaLibraryClient } from "./media-library-client";
import { MediaAccessDenied } from "./components/media-access-denied";

/**
 * Workspace media library (FR-123). The read capability is checked on the
 * server before the client boundary, and the client re-checks it so a direct
 * render can never fail open.
 */
export default async function MediaPage() {
  const session = await requireAuth();
  const userPermissions = session.permissions ?? [];
  if (!hasPermission(userPermissions, PERMISSIONS.MEDIA.READ)) {
    return <MediaAccessDenied />;
  }
  return <MediaLibraryClient userPermissions={userPermissions} />;
}
