"use client";

import React, { useState } from "react";
import { Modal, Button, AlertTriangleIcon } from "@suite/ui";
import type { MemberListItemDto } from "@/services/members.service";

export interface MemberDangerModalProps {
  member: MemberListItemDto | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  isProcessing?: boolean;
}

export function MemberDangerModal({
  member,
  isOpen,
  onClose,
  onConfirm,
  isProcessing = false,
}: MemberDangerModalProps) {
  const [confirmed, setConfirmed] = useState(false);

  if (!member) return null;

  const handleClose = () => {
    if (!isProcessing) {
      setConfirmed(false);
      onClose();
    }
  };

  if (member.isPrimaryOwner) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        size="sm"
        title="Action Prohibited"
      >
        <div className="space-y-4 pt-1">
          <p className="text-xs text-danger font-medium">
            The primary organization owner cannot be removed.
          </p>
          <div className="flex justify-end pt-2 border-t border-border">
            <Button type="button" onClick={handleClose} className="text-xs">
              Close
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  const handleConfirm = async () => {
    if (isProcessing) return;
    await onConfirm();
    setConfirmed(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="sm"
      className="border-2 border-danger/60"
      title={
        <div className="flex items-center gap-2.5">
          <div className="rounded-full bg-danger/10 p-2 text-danger">
            <AlertTriangleIcon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text">
              Remove Member: {member.name}
            </h3>
            <p className="text-xs text-text-secondary">
              Permanently delete membership and access from this workspace.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <div className="rounded-lg bg-surface-subtle p-3 text-xs space-y-2 border border-border">
          <p className="font-semibold text-text">
            Permanent Removal Notice:
          </p>
          <ul className="list-disc list-inside space-y-1 text-text-muted">
            <li>
              The member and all assigned branch roles will be permanently deleted from this workspace.
            </li>
            <li>
              Active user sessions on all mobile, desktop, and POS terminals will be revoked immediately.
            </li>
            <li>
              The user&apos;s email address will be completely freed if you wish to re-invite them in the future.
            </li>
            <li>
              If this member is the last active organization owner, this action will be strictly blocked.
            </li>
          </ul>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="confirm-remove"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="rounded border-border text-danger focus:ring-danger cursor-pointer h-4 w-4"
          />
          <label htmlFor="confirm-remove" className="text-xs text-text font-medium cursor-pointer">
            I understand that this member will be permanently removed from this workspace
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isProcessing}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={!confirmed || isProcessing}
            className="text-xs font-semibold"
          >
            {isProcessing ? "Removing..." : "Remove Member"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
