"use client";

import React, { useEffect, useId, useState } from "react";
import { Button, FileField, Modal } from "@suite/ui";
import { MEDIA_ALLOWED_MIME_TYPES } from "../constants.js";
import type { FinalizeUploadView } from "../contracts.js";
import type { MediaClient } from "./media-client.js";
import { MediaProblemAlert } from "./media-problem-alert.js";
import { formatMediaFileSize } from "./media-format.js";
import { toMediaError } from "./use-media-assets.js";

export interface MediaUploadDialogProps {
  readonly client: MediaClient;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onUploaded: (upload: FinalizeUploadView) => void;
}

interface UploadSelectionSummaryProps {
  readonly file: File;
}

function UploadSelectionSummary({ file }: UploadSelectionSummaryProps) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-3 text-xs">
      <p className="font-semibold text-text">{file.name}</p>
      <p className="text-text-muted">
        {file.type.length > 0 ? file.type : "Unknown type"} ·{" "}
        {formatMediaFileSize(file.size)}
      </p>
    </div>
  );
}

interface UploadFormProps {
  readonly inputId: string;
  readonly file: File | null;
  readonly error: Error | null;
  readonly isUploading: boolean;
  readonly onFileChange: (file: File | null) => void;
  readonly onSubmit: () => void;
}

function UploadForm({
  inputId,
  file,
  error,
  isUploading,
  onFileChange,
  onSubmit,
}: UploadFormProps) {
  return (
    <form
      id="media-upload-form"
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <FileField
        id={inputId}
        label="Image file"
        accept={MEDIA_ALLOWED_MIME_TYPES.join(",")}
        actionLabel="Choose image"
        hint={`Accepted types: ${MEDIA_ALLOWED_MIME_TYPES.join(", ")}.`}
        disabled={isUploading}
        onChange={onFileChange}
      />
      {file === null ? (
        <p className="text-xs text-text-secondary" role="status">
          No file selected yet.
        </p>
      ) : (
        <UploadSelectionSummary file={file} />
      )}
      {error === null ? null : <MediaProblemAlert error={error} title="Upload failed" />}
    </form>
  );
}

function UploadFooter({
  isUploading,
  canSubmit,
  onClose,
}: {
  readonly isUploading: boolean;
  readonly canSubmit: boolean;
  readonly onClose: () => void;
}) {
  return (
    <>
      <Button type="button" variant="outline" onClick={onClose} disabled={isUploading}>
        Cancel
      </Button>
      <Button
        type="submit"
        form="media-upload-form"
        isLoading={isUploading}
        disabled={!canSubmit}
      >
        Upload image
      </Button>
    </>
  );
}

interface UploadActionOptions {
  readonly client: MediaClient;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onUploaded: (upload: FinalizeUploadView) => void;
}

interface UploadActionState {
  readonly file: File | null;
  readonly error: Error | null;
  readonly isUploading: boolean;
  readonly selectFile: (file: File | null) => void;
  readonly close: () => void;
  readonly submit: () => void;
}

function useUploadAction(options: UploadActionOptions): UploadActionState {
  const { client, isOpen, onClose, onUploaded } = options;
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setError(null);
      setIsUploading(false);
    }
  }, [isOpen]);

  const close = (): void => {
    if (isUploading) return;
    onClose();
  };

  const submit = (): void => {
    if (file === null || isUploading) return;
    setIsUploading(true);
    setError(null);
    void client
      .uploadAsset(file)
      .then((upload) => {
        onUploaded(upload);
        setFile(null);
        onClose();
      })
      .catch((uploadError: unknown) => {
        setError(toMediaError(uploadError));
      })
      .finally(() => {
        setIsUploading(false);
      });
  };

  return {
    file,
    error,
    isUploading,
    selectFile: (selected) => {
      setFile(selected);
      setError(null);
    },
    close,
    submit,
  };
}

/**
 * The single upload surface used by the workspace library and every picker.
 * Bytes go straight to object storage through the presigned URL; this dialog
 * never proxies them through the API.
 */
export function MediaUploadDialog({
  client,
  isOpen,
  onClose,
  onUploaded,
}: MediaUploadDialogProps) {
  const inputId = useId();
  const action = useUploadAction({ client, isOpen, onClose, onUploaded });
  return (
    <Modal
      isOpen={isOpen}
      onClose={action.close}
      size="md"
      title="Upload media"
      description="Add an image to the shared workspace library."
      footer={
        <UploadFooter
          isUploading={action.isUploading}
          canSubmit={action.file !== null}
          onClose={action.close}
        />
      }
    >
      <UploadForm
        inputId={inputId}
        file={action.file}
        error={action.error}
        isUploading={action.isUploading}
        onFileChange={action.selectFile}
        onSubmit={action.submit}
      />
    </Modal>
  );
}
