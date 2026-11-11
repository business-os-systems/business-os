"use client";

import React from "react";
import {
  MediaUploadDialog,
  type MediaClient,
} from "@suite/media/react";
import type { MediaLibraryState } from "../hooks/use-media-library";
import { MediaDeleteProblemDialog } from "./media-delete-problem-dialog";
import { MediaDetailModal } from "./media-detail-modal";

export interface MediaLibraryDialogsProps {
  readonly state: MediaLibraryState;
  readonly client: MediaClient;
  readonly userPermissions: readonly string[];
}

export function MediaLibraryDialogs({
  state,
  client,
  userPermissions,
}: MediaLibraryDialogsProps) {
  return (
    <>
      <MediaUploadDialog
        client={client}
        isOpen={state.uploadOpen}
        onClose={state.closeUpload}
        onUploaded={state.onUploaded}
      />
      <MediaDetailModal
        client={client}
        assetId={state.detailAssetId}
        userPermissions={userPermissions}
        onClose={state.closeDetail}
        onDeleted={state.onDeleted}
      />
      <MediaDeleteProblemDialog
        error={state.deleteError}
        onClose={state.clearDeleteError}
      />
    </>
  );
}
