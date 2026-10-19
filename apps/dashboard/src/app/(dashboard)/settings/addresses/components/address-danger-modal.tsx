"use client";

import React, { useState } from "react";
import { Modal, Button, Input, AlertTriangleIcon } from "@suite/ui";
import type { AddressListItemDto } from "@/services/addresses.service";

export interface AddressDangerModalProps {
  address: AddressListItemDto | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  isProcessing?: boolean;
}

export function AddressDangerModal({
  address,
  isOpen,
  onClose,
  onConfirm,
  isProcessing = false,
}: AddressDangerModalProps) {
  const [typedConfirm, setTypedConfirm] = useState("");

  if (!address) return null;

  const isBlocked = !address.isDeletable;
  const locationName =
    address.addressType === "RURAL"
      ? address.village || address.district || "DELETE"
      : address.city || "DELETE";
  const expectedCity = locationName.toUpperCase();
  const isMatch = typedConfirm.trim().toUpperCase() === expectedCity;

  const handleClose = () => {
    if (!isProcessing) {
      setTypedConfirm("");
      onClose();
    }
  };

  const handleConfirm = async () => {
    if (isBlocked || !isMatch || isProcessing) return;
    await onConfirm();
    setTypedConfirm("");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="sm"
      className={isBlocked ? "border border-border" : "border-2 border-brand"}
      title={
        <div className="flex items-center gap-2.5">
          <div
            className={`rounded-full p-2 ${
              isBlocked ? "bg-surface-subtle text-text-muted" : "bg-brand-tint text-brand"
            }`}
          >
            <AlertTriangleIcon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text">
              {isBlocked ? "Address In Use (Protected)" : "Delete Operational Address"}
            </h3>
            <p className="text-xs text-text-secondary">
              {address.streetAddress}, {address.city}
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-4 pt-2">
        {isBlocked ? (
          <div className="rounded-lg bg-surface-subtle border border-border p-3 space-y-2">
            <p className="text-xs font-semibold text-danger">
              Deletion Blocked: Active Operational Dependency
            </p>
            <p className="text-xs text-text-secondary leading-relaxed">
              {address.inUseReason ||
                "This address is actively linked to an organization profile or branch operational site."}
            </p>
            <p className="text-[11px] text-text-muted">
              To delete this address, first re-assign or unbind it from the referenced organization or branch.
            </p>
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClose}
                className="text-xs h-8 px-3"
              >
                Understood
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-text-secondary leading-relaxed">
              This address is currently unlinked from all branches and legal profiles. Permanently deleting it will remove it from your organization&apos;s directory.
            </p>

            <div className="rounded-lg bg-surface-subtle border border-border p-3 space-y-1">
              <p className="text-[11px] font-semibold text-text">
                To confirm permanent deletion, please type the city name below:
              </p>
              <p className="text-xs font-mono font-bold text-brand select-all">
                {expectedCity}
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="danger-address-confirm-input"
                className="text-xs font-medium text-text-secondary"
              >
                Verification City
              </label>
              <Input
                id="danger-address-confirm-input"
                type="text"
                placeholder={`Type ${expectedCity} to confirm`}
                value={typedConfirm}
                onChange={(e) => setTypedConfirm(e.target.value)}
                disabled={isProcessing}
                className="font-mono text-xs uppercase"
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
                className="text-xs h-8 px-3"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleConfirm}
                disabled={!isMatch || isProcessing}
                className="text-xs h-8 px-3 bg-brand hover:bg-brand/90 text-white border-none"
              >
                {isProcessing ? "Deleting..." : "Permanently Delete"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
