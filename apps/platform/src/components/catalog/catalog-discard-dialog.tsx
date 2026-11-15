"use client";

import { Button, Modal } from "@suite/ui";

export interface CatalogDiscardDialogProps {
  readonly onKeepEditing: () => void;
  readonly onDiscard: () => void;
}

/** Unsaved edits are never dropped silently. */
export function CatalogDiscardDialog(props: CatalogDiscardDialogProps) {
  return (
    <Modal
      isOpen
      size="sm"
      onClose={props.onKeepEditing}
      title="Discard this draft?"
      description="The edits in this draft have not been saved."
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={props.onKeepEditing}>
            Keep editing
          </Button>
          <Button type="button" variant="destructive" onClick={props.onDiscard}>
            Discard
          </Button>
        </div>
      }
    >
      <p className="text-sm text-text-secondary">
        Closing now loses every change since the last save.
      </p>
    </Modal>
  );
}
