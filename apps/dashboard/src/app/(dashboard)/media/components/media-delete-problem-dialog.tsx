"use client";

import React from "react";
import { Button, Modal } from "@suite/ui";
import { MediaProblemAlert } from "@suite/media/react";

export interface MediaDeleteProblemDialogProps {
  readonly error: Error | null;
  readonly onClose: () => void;
}

/** Surfaces a deletion refusal verbatim, including every referencing location. */
export function MediaDeleteProblemDialog({
  error,
  onClose,
}: MediaDeleteProblemDialogProps) {
  return (
    <Modal
      isOpen={error !== null}
      onClose={onClose}
      size="lg"
      title="Asset could not be deleted"
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      {error === null ? null : <MediaProblemAlert error={error} />}
    </Modal>
  );
}
