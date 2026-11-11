"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchCatalogItem,
  publishCatalogItem,
  previewCatalogItem,
  type CatalogItem,
} from "@/lib/catalog-api";
import { createIdempotencyKey } from "@/lib/api";
import { toMessage } from "@/lib/error-message";
import { isPreviewRequiredError } from "@/lib/problem-error";
import { useRequestTicket } from "@/lib/use-request-ticket";
import {
  itemNeedsPreview,
  type CatalogPreviewRecordingState,
  type CatalogPublishError,
} from "./catalog-preview-state";

interface CatalogPreviewLoaderInput {
  readonly appId: string;
  readonly itemId: string;
  readonly enabled: boolean;
  readonly canRecordPreview: boolean;
}

/**
 * Fetches the item once and records the completed preview through the P-03
 * endpoint. The recording is what satisfies the publish precondition; a
 * publish-only operator cannot record it, so the gate stays closed (FR-092).
 */
export function useCatalogPreview(input: CatalogPreviewLoaderInput) {
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<CatalogPreviewRecordingState>({ kind: "idle" });
  const requestTicket = useRequestTicket();

  const load = useCallback(async () => {
    const current = requestTicket.begin();
    setIsLoading(true);
    setError(null);
    try {
      const loaded = await fetchCatalogItem(input.appId, input.itemId);
      if (requestTicket.isCurrent(current)) {
        setItem(loaded);
      }
    } catch (cause) {
      if (requestTicket.isCurrent(current)) {
        setError(toMessage(cause));
      }
    } finally {
      if (requestTicket.isCurrent(current)) {
        setIsLoading(false);
      }
    }
  }, [input.appId, input.itemId, requestTicket]);

  useEffect(() => {
    if (input.enabled) {
      void load();
    }
  }, [input.enabled, load]);

  const recordPreview = useCallback(async () => {
    setRecording({ kind: "recording" });
    try {
      const preview = await previewCatalogItem({
        appId: input.appId,
        itemId: input.itemId,
        idempotencyKey: createIdempotencyKey(),
      });
      setRecording({ kind: "recorded", version: preview.version, expiresAt: preview.expiresAt });
    } catch (cause) {
      setRecording({ kind: "error", message: toMessage(cause) });
    }
  }, [input.appId, input.itemId]);

  useEffect(() => {
    if (
      input.enabled &&
      input.canRecordPreview &&
      item !== null &&
      itemNeedsPreview(item) &&
      recording.kind === "idle"
    ) {
      void recordPreview();
    }
  }, [input.enabled, input.canRecordPreview, item, recording.kind, recordPreview]);

  return { item, setItem, isLoading, error, recording, setRecording, reload: load, recordPreview };
}

interface CatalogPublishInput {
  readonly appId: string;
  readonly item: CatalogItem;
  readonly recording: CatalogPreviewRecordingState;
  readonly setItem: (item: CatalogItem) => void;
  readonly setRecording: (state: CatalogPreviewRecordingState) => void;
}

/** One publish lifecycle; a PREVIEW_REQUIRED response reopens the preview gate. */
export function useCatalogPublish(input: CatalogPublishInput) {
  const [changeNote, setChangeNote] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<CatalogPublishError | null>(null);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);

  async function publish(): Promise<void> {
    if (input.recording.kind !== "recorded") {
      setPublishError({
        message: "Preview the current draft before publishing it.",
        previewRequired: true,
      });
      return;
    }
    const version = input.recording.version;
    setIsPublishing(true);
    setPublishError(null);
    setPublishSuccess(null);
    try {
      const updated = await publishCatalogItem({
        appId: input.appId,
        itemId: input.item.id,
        body: {
          version,
          ...(changeNote.trim() === "" ? {} : { changeNote: changeNote.trim() }),
        },
        idempotencyKey: createIdempotencyKey(),
      });
      input.setItem(updated);
      input.setRecording({ kind: "idle" });
      setPublishSuccess(`Version v${version} is live.`);
    } catch (cause) {
      const previewRequired = isPreviewRequiredError(cause);
      setPublishError({ message: toMessage(cause), previewRequired });
      if (previewRequired) {
        input.setRecording({ kind: "error", message: toMessage(cause) });
      }
    } finally {
      setIsPublishing(false);
    }
  }

  function publishVersion(): void {
    setPublishError(null);
    setPublishSuccess(null);
    void publish();
  }

  return {
    changeNote,
    setChangeNote,
    isPublishing,
    publishError,
    publishSuccess,
    publishVersion,
  };
}
