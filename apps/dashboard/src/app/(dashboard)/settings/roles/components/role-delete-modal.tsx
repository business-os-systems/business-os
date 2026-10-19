"use client";

import React, { useState } from "react";
import { Modal, Button, AlertTriangleIcon } from "@suite/ui";
import type { RoleDetailDto } from "@/services/roles.service";

export interface RoleDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: RoleDetailDto | null;
  onConfirm: (role: RoleDetailDto) => Promise<boolean>;
}

export function RoleDeleteModal({
  isOpen,
  onClose,
  role,
  onConfirm,
}: RoleDeleteModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!role) return null;

  const handleDelete = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      const success = await onConfirm(role);
      if (success) {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete role.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      className="p-4 sm:p-5"
      title="Delete Custom Role"
      description={`Are you sure you want to permanently delete the '${role.name}' role?`}
    >
      <div className="space-y-4 pt-2">
        {error && (
          <div className="p-3 bg-danger/10 border border-danger/30 text-danger rounded-lg text-xs font-medium">
            {error}
          </div>
        )}

        <div className="p-3.5 bg-danger/10 border border-danger/30 rounded-xl flex items-start gap-3">
          <AlertTriangleIcon size={18} className="shrink-0 text-danger mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-danger">Permanent Action</p>
            <p className="text-text-secondary leading-relaxed">
              This custom access role will be permanently removed from your organization. Ensure no team members or pending invitations are assigned to this role before proceeding.
            </p>
          </div>
        </div>

        <div className="pt-2 flex flex-col-reverse sm:flex-row items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
            className="w-full sm:w-auto font-semibold"
          >
            {isDeleting ? "Deleting Role..." : "Delete Role"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
