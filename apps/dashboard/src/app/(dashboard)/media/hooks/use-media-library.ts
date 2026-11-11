"use client";

import { useCallback, useMemo, useState } from "react";
import { PERMISSIONS, hasPermission } from "@suite/core";
import {
  MEDIA_DEFAULT_PAGE_SIZE,
  buildMediaListQuery,
  toMediaError,
  useMediaAssets,
  type FinalizeUploadView,
  type MediaAssetView,
  type MediaAssetsState,
  type MediaClient,
} from "@suite/media/react";
import { useMediaFilter, type MediaFilterControls } from "./use-media-filter";

export interface MediaLibraryState {
  readonly controls: MediaFilterControls;
  readonly assets: MediaAssetsState;
  readonly canUpload: boolean;
  readonly notice: string | null;
  readonly uploadOpen: boolean;
  readonly detailAssetId: string | null;
  readonly deleteError: Error | null;
  readonly openUpload: () => void;
  readonly closeUpload: () => void;
  readonly openDetail: (assetId: string) => void;
  readonly closeDetail: () => void;
  readonly clearDeleteError: () => void;
  readonly onUploaded: (upload: FinalizeUploadView) => void;
  readonly deleteAsset: (asset: MediaAssetView) => Promise<void>;
  readonly onDeleted: () => void;
}

export function useMediaLibrary(
  client: MediaClient,
  userPermissions: readonly string[]
): MediaLibraryState {
  const controls = useMediaFilter();
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<Error | null>(null);
  const query = useMemo(
    () => buildMediaListQuery(controls.filter, MEDIA_DEFAULT_PAGE_SIZE),
    [controls.filter]
  );
  const assets = useMediaAssets(client, query);
  const reload = assets.reload;

  const onUploaded = useCallback(
    (upload: FinalizeUploadView): void => {
      const message = upload.duplicate
        ? "That image was already in the library; the existing asset was reused."
        : "Image uploaded to the shared library.";
      setNotice(message);
      void reload();
    },
    [reload]
  );

  const deleteAsset = useCallback(
    async (asset: MediaAssetView): Promise<void> => {
      try {
        await client.deleteAsset(asset.id);
        setNotice(`Deleted ${asset.fileName}.`);
        await reload();
      } catch (error) {
        setDeleteError(toMediaError(error));
      }
    },
    [client, reload]
  );

  const onDeleted = useCallback((): void => {
    setNotice("Asset deleted from the shared library.");
    void reload();
  }, [reload]);

  return {
    controls,
    assets,
    canUpload: hasPermission(userPermissions, PERMISSIONS.MEDIA.UPLOAD),
    notice,
    uploadOpen,
    detailAssetId,
    deleteError,
    openUpload: () => setUploadOpen(true),
    closeUpload: () => setUploadOpen(false),
    openDetail: (assetId) => setDetailAssetId(assetId),
    closeDetail: () => setDetailAssetId(null),
    clearDeleteError: () => setDeleteError(null),
    onUploaded,
    deleteAsset,
    onDeleted,
  };
}
