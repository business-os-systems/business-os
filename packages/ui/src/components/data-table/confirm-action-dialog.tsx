"use client";

import { useId, useState } from "react";
import { Button } from "../button.js";
import { Input } from "../input.js";
import { Label } from "../label.js";
import { Modal } from "../modal.js";

export interface ConfirmActionDialogProps {
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly expectedPhrase?: string;
  readonly onConfirm: () => void | Promise<void>;
  readonly onClose: () => void;
}

/**
 * One destructive-confirmation surface for the shared table engine. A typed
 * phrase is required when the action declares one; a plain confirmation is
 * used otherwise. It replaces the previous window.confirm path.
 */
function DialogFooter({
  isProcessing,
  matches,
  actionLabel,
  onConfirm,
  onClose,
}: {
  readonly isProcessing: boolean;
  readonly matches: boolean;
  readonly actionLabel: string;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" disabled={isProcessing} onClick={onClose}>
        Cancel
      </Button>
      <Button
        variant="destructive"
        isLoading={isProcessing}
        disabled={!matches || isProcessing}
        onClick={onConfirm}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

function PhraseField({
  inputId,
  expectedPhrase,
  phrase,
  setPhrase,
  disabled,
}: {
  readonly inputId: string;
  readonly expectedPhrase: string;
  readonly phrase: string;
  readonly setPhrase: (value: string) => void;
  readonly disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>
        Type{" "}
        <span className="font-mono font-semibold text-text">
          {expectedPhrase}
        </span>{" "}
        to confirm
      </Label>
      <Input
        id={inputId}
        value={phrase}
        onChange={(event) => setPhrase(event.target.value)}
        disabled={disabled}
        autoComplete="off"
      />
    </div>
  );
}

export function ConfirmActionDialog({
  title,
  description,
  actionLabel,
  expectedPhrase,
  onConfirm,
  onClose,
}: ConfirmActionDialogProps) {
  const inputId = useId();
  const [phrase, setPhrase] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const requiresPhrase = expectedPhrase !== undefined;
  const matches = !requiresPhrase || phrase.trim() === expectedPhrase.trim();

  async function confirm(): Promise<void> {
    if (!matches || isProcessing) return;
    setIsProcessing(true);
    try {
      await onConfirm();
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!isProcessing) onClose();
      }}
      title={title}
      description={description}
      size="md"
      footer={
        <DialogFooter
          isProcessing={isProcessing}
          matches={matches}
          actionLabel={actionLabel}
          onConfirm={() => void confirm()}
          onClose={onClose}
        />
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-text-secondary">
          This action cannot be undone.
        </p>
        {requiresPhrase ? (
          <PhraseField
            inputId={inputId}
            expectedPhrase={expectedPhrase}
            phrase={phrase}
            setPhrase={setPhrase}
            disabled={isProcessing}
          />
        ) : null}
      </div>
    </Modal>
  );
}
