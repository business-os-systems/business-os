"use client";

import React from "react";
import {
  Button,
  ConfirmActionDialog,
  Modal,
  Spinner,
  TrashIcon,
} from "@suite/ui";
import { PERMISSIONS, hasPermission } from "@suite/core";
import {
  MediaAccessDeniedAlert,
  MediaProblemAlert,
  type MediaClient,
} from "@suite/media/react";
import { useAssetDetail, type AssetDetailState } from "../hooks/use-asset-detail";
import { useMediaDelete } from "../hooks/use-media-delete";
import { MediaAssetOverview } from "./media-asset-overview";
import { MediaUsageList } from "./media-usage-list";

export interface MediaDetailModalProps {
  readonly client: MediaClient;
  readonly assetId: string | null;
  readonly userPermissions: readonly string[];
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}

function DetailBody({
  canRead,
  state,
  deleteError,
}: {
  readonly canRead: boolean;
  readonly state: AssetDetailState;
  readonly deleteError: Error | null;
}) {
  if (!canRead) {
    return <MediaAccessDeniedAlert />;
  }
  if (state.kind === "loading") {
    return (
      <div className="flex items-center justify-center p-8" role="status">
        <Spinner size="lg" color="action" />
        <span className="ml-2 text-xs text-text-muted">Loading asset…</span>
      </div>
    );
  }
  if (state.kind === "error") {
    return <MediaProblemAlert error={state.error} title="Could not load this asset" />;
  }
  if (state.kind === "idle") {
    return null;
  }
  return (
    <div className="space-y-5">
      <MediaAssetOverview detail={state.detail} />
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Usage locations
        </h3>
        <div className="mt-2">
          <MediaUsageList usages={state.detail.usages} />
        </div>
      </div>
      {deleteError === null ? null : (
        <MediaProblemAlert error={deleteError} title="Asset could not be deleted" />
      )}
    </div>
  );
}

function DetailFooter({
  canDelete,
  hasDetail,
  onClose,
  onDelete,
}: {
  readonly canDelete: boolean;
  readonly hasDetail: boolean;
  readonly onClose: () => void;
  readonly onDelete: () => void;
}) {
  return (
    <>
      <Button type="button" variant="outline" onClick={onClose}>
        Close
      </Button>
      {canDelete && hasDetail ? (
        <Button type="button" variant="destructive" onClick={onDelete}>
          <TrashIcon className="h-4 w-4" />
          Delete asset
        </Button>
      ) : null}
    </>
  );
}

export function MediaDetailModal({
  client,
  assetId,
  userPermissions,
  onClose,
  onDeleted,
}: MediaDetailModalProps) {
  const canRead = hasPermission(userPermissions, PERMISSIONS.MEDIA.READ);
  const canDelete = hasPermission(userPermissions, PERMISSIONS.MEDIA.DELETE);
  const state = useAssetDetail(client, assetId, canRead);
  const deletion = useMediaDelete({ client, assetId, onDeleted, onClose });

  return (
    <>
      <Modal
        isOpen={assetId !== null && !deletion.isConfirming}
        onClose={onClose}
        size="xl"
        title="Asset details and usage"
        footer={
          <DetailFooter
            canDelete={canDelete}
            hasDetail={state.kind === "ready"}
            onClose={onClose}
            onDelete={deletion.requestConfirmation}
          />
        }
      >
        <DetailBody
          canRead={canRead}
          state={state}
          deleteError={deletion.deleteError}
        />
      </Modal>
      {deletion.isConfirming ? (
        <ConfirmActionDialog
          title="Delete this asset?"
          description="Deletion is refused while published content references the asset; the refusal lists every location."
          actionLabel="Delete asset"
          onClose={deletion.cancelConfirmation}
          onConfirm={deletion.confirmDelete}
        />
      ) : null}
    </>
  );
}
