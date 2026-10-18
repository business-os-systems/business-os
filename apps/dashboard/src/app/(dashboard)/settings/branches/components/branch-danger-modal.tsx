"use client";

import React, { useState } from "react";
import { Modal, Button, Input, AlertTriangleIcon } from "@suite/ui";
import type { BranchListItemDto } from "@/services/branches.service";

export interface BranchDangerModalProps {
  branch: BranchListItemDto | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  isProcessing?: boolean;
}

export function BranchDangerModal({
  branch,
  isOpen,
  onClose,
  onConfirm,
  isProcessing = false,
}: BranchDangerModalProps) {
  const [typedSlug, setTypedSlug] = useState("");

  if (!branch) return null;

  const expectedSlug = branch.code;
  const isMatch = typedSlug.trim() === expectedSlug.trim();

  const handleClose = () => {
    if (!isProcessing) {
      setTypedSlug("");
      onClose();
    }
  };

  const handleConfirm = async () => {
    if (!isMatch || isProcessing) return;
    await onConfirm();
    setTypedSlug("");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="sm"
      className="border-2 border-brand"
      title={
        <div className="flex items-center gap-2.5">
          <div className="rounded-full bg-brand-tint p-2 text-brand">
            <AlertTriangleIcon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text">
              Archive Branch: {branch.name}
            </h3>
            <p className="text-xs text-text-secondary">
              This operational unit will be marked as ARCHIVED.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-4 pt-2">
        <p className="text-xs text-text-secondary leading-relaxed">
          Archiving a branch stops staff from opening new cash shifts or taking orders at this site. Historical audit records and folios will remain preserved.
        </p>

        <div className="rounded-lg bg-surface-subtle border border-border p-3 space-y-1">
          <p className="text-[11px] font-semibold text-text">
            To confirm this destructive action, please type the exact branch code below:
          </p>
          <p className="text-xs font-mono font-bold text-brand select-all">
            {expectedSlug}
          </p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="danger-branch-slug-input"
            className="text-xs font-medium text-text-secondary"
          >
            Verification Code
          </label>
          <Input
            id="danger-branch-slug-input"
            type="text"
            placeholder={`Type ${expectedSlug} to confirm`}
            value={typedSlug}
            onChange={(e) => setTypedSlug(e.target.value)}
            disabled={isProcessing}
            className="font-mono text-xs"
            autoComplete="off"
            autoFocus
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={isProcessing}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!isMatch || isProcessing}
            onClick={handleConfirm}
            className="text-xs font-semibold"
          >
            {isProcessing ? "Archiving..." : "Confirm & Archive"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
