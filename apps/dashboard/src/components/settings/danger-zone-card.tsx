import React, { useState } from "react";
import { Button, Input, Spinner, AlertTriangleIcon } from "@suite/ui";

export interface DangerZoneCardProps {
  /**
   * Title of the destructive action (e.g., "Delete Organization", "Deactivate Branch").
   */
  title: string;
  /**
   * Explanation of the irreversible impact of this action.
   */
  description: string;
  /**
   * Primary button label to open confirmation dialog.
   */
  actionLabel: string;
  /**
   * The exact identifier or slug that the user MUST type to verify intent.
   */
  expectedSlug: string;
  /**
   * Prompt message explaining what slug to type.
   */
  confirmationPrompt?: string;
  /**
   * Whether the destructive request is currently processing.
   */
  isProcessing?: boolean;
  /**
   * Callback executed when the typed slug matches and the user confirms.
   */
  onConfirm: () => void | Promise<void>;
  /**
   * Whether the danger zone trigger is disabled (e.g. due to permissions).
   */
  disabled?: boolean;
  /**
   * Optional custom CSS class name.
   */
  className?: string;
}

/**
 * DangerZoneCard
 *
 * Dedicated protective card requiring exact identifier typing verification
 * prior to unlocking high-stakes destructive or organization-altering actions.
 */
export function DangerZoneCard({
  title,
  description,
  actionLabel,
  expectedSlug,
  confirmationPrompt,
  isProcessing = false,
  onConfirm,
  disabled = false,
  className = "",
}: DangerZoneCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [typedSlug, setTypedSlug] = useState("");
  const isMatch = typedSlug.trim() === expectedSlug.trim();

  const handleOpen = () => {
    setTypedSlug("");
    setIsOpen(true);
  };

  const handleClose = () => {
    if (!isProcessing) {
      setTypedSlug("");
      setIsOpen(false);
    }
  };

  const handleConfirm = async () => {
    if (!isMatch || isProcessing) return;
    await onConfirm();
    setIsOpen(false);
    setTypedSlug("");
  };

  return (
    <>
      <div
        className={`rounded-xl border border-danger/30 bg-danger/5 p-5 sm:p-6 transition-colors ${className}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <AlertTriangleIcon className="h-5 w-5 text-danger shrink-0" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-text">{title}</h3>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed max-w-xl">
              {description}
            </p>
          </div>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={disabled}
            onClick={handleOpen}
            className="shrink-0 self-start sm:self-auto font-medium"
          >
            {actionLabel}
          </Button>
        </div>
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="danger-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim backdrop-blur-sm"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-danger/40 bg-surface p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5">
              <div className="rounded-full bg-danger/10 p-2 text-danger">
                <AlertTriangleIcon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 id="danger-dialog-title" className="text-base font-semibold text-text">
                  Confirm {title}
                </h3>
                <p className="text-xs text-text-muted">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              {confirmationPrompt ?? (
                <>
                  To proceed, please type <strong className="font-mono text-danger select-all">{expectedSlug}</strong> below to confirm.
                </>
              )}
            </p>

            <div className="space-y-2">
              <Input
                type="text"
                value={typedSlug}
                onChange={(e) => setTypedSlug(e.target.value)}
                placeholder={expectedSlug}
                disabled={isProcessing}
                className="font-mono text-sm border-danger/40 focus:border-danger focus:ring-danger/20"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={!isMatch || isProcessing}
                onClick={handleConfirm}
                className="inline-flex items-center gap-1.5"
              >
                {isProcessing && <Spinner size="sm" className="h-3 w-3" />}
                <span>{isProcessing ? "Processing..." : `I understand, ${actionLabel}`}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
