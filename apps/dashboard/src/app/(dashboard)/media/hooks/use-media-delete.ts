"use client";

import { useEffect, useState } from "react";
import { toMediaError, type MediaClient } from "@suite/media/react";

export interface MediaDeleteState {
  readonly isDeleting: boolean;
  readonly deleteError: Error | null;
  readonly isConfirming: boolean;
  readonly requestConfirmation: () => void;
  readonly cancelConfirmation: () => void;
  readonly confirmDelete: () => Promise<void>;
}

export interface MediaDeleteOptions {
  readonly client: MediaClient;
  readonly assetId: string | null;
  readonly onDeleted: () => void;
  readonly onClose: () => void;
}

/** One destructive flow used by the detail view: confirm, delete, report. */
export function useMediaDelete({
  client,
  assetId,
  onDeleted,
  onClose,
}: MediaDeleteOptions): MediaDeleteState {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<Error | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    setDeleteError(null);
    setIsConfirming(false);
  }, [assetId]);

  const confirmDelete = async (): Promise<void> => {
    if (assetId === null) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await client.deleteAsset(assetId);
      setIsConfirming(false);
      onDeleted();
      onClose();
    } catch (error) {
      setDeleteError(toMediaError(error));
      setIsConfirming(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    isDeleting,
    deleteError,
    isConfirming,
    requestConfirmation: () => setIsConfirming(true),
    cancelConfirmation: () => setIsConfirming(false),
    confirmDelete,
  };
}
