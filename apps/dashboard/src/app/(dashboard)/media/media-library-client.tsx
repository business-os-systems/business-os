"use client";

import React, { useMemo } from "react";
import { Alert } from "@suite/ui";
import { PERMISSIONS, hasPermission } from "@suite/core";
import {
  MediaAccessDeniedAlert,
  createMediaApiClient,
  type MediaClient,
} from "@suite/media/react";
import { useMediaLibrary } from "./hooks/use-media-library";
import { MediaLibraryHeader } from "./components/media-library-header";
import { MediaLibraryTable } from "./components/media-library-table";
import { MediaLibraryDialogs } from "./components/media-library-dialogs";

export interface MediaLibraryClientProps {
  readonly userPermissions: readonly string[];
  /** Test seam; production uses the same-origin API rewrite. */
  readonly client?: MediaClient;
}

export function MediaLibraryClient({
  userPermissions,
  client,
}: MediaLibraryClientProps) {
  const fallbackClient = useMemo(
    () => createMediaApiClient({ baseUrl: "" }),
    []
  );
  if (!hasPermission(userPermissions, PERMISSIONS.MEDIA.READ)) {
    return <MediaAccessDeniedAlert />;
  }
  return (
    <MediaLibraryContent
      client={client ?? fallbackClient}
      userPermissions={userPermissions}
    />
  );
}

function MediaLibraryContent({
  client,
  userPermissions,
}: {
  readonly client: MediaClient;
  readonly userPermissions: readonly string[];
}) {
  const state = useMediaLibrary(client, userPermissions);
  return (
    <div className="flex flex-col gap-4">
      <MediaLibraryHeader total={state.assets.assets.length} />
      {state.notice === null ? null : (
        <Alert variant="success" role="status" message={state.notice} />
      )}
      <MediaLibraryTable state={state} userPermissions={userPermissions} />
      <MediaLibraryDialogs
        state={state}
        client={client}
        userPermissions={userPermissions}
      />
    </div>
  );
}
