import React, { useState } from "react";
import { Button, Input, Spinner, AlertTriangleIcon, Modal, cn } from "@suite/ui";

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
 * Consumes standardized Modal wrapper from @suite/ui and Terracotta brand tokens.
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
        className={cn(
          "rounded-xl border-2 border-brand bg-brand-tint/30 dark:bg-brand-tint/40 p-5 sm:p-6 transition-colors shadow-sm",
          className,
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <AlertTriangleIcon
                className="h-5 w-5 text-brand dark:text-brand-text shrink-0"
                aria-hidden="true"
              />
              <h3 className="text-sm font-bold text-brand dark:text-brand-text">
                {title}
              </h3>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed max-w-xl">
              {description}
            </p>
          </div>

          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={handleOpen}
            className="shrink-0 self-start sm:self-auto font-semibold bg-brand hover:bg-brand-hover text-on-brand shadow-sm"
          >
            {actionLabel}
          </Button>
        </div>
      </div>

      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        size="sm"
        className="border-2 border-brand"
        title={
          <div className="flex items-center gap-2.5">
            <div className="rounded-full bg-brand-tint p-2 text-brand dark:text-brand-text">
              <AlertTriangleIcon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <span className="text-base font-bold text-text">Confirm {title}</span>
              <p className="text-xs text-brand dark:text-brand-text font-medium">
                This action cannot be undone.
              </p>
            </div>
          </div>
        }
        footer={
          <>
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
              size="sm"
              disabled={!isMatch || isProcessing}
              onClick={handleConfirm}
              className={cn(
                "inline-flex items-center gap-1.5 font-semibold transition-all",
                isMatch
                  ? "bg-brand hover:bg-brand-hover text-on-brand shadow-sm"
                  : "bg-surface-muted text-text-muted border border-border cursor-not-allowed opacity-60",
              )}
            >
              {isProcessing && <Spinner size="sm" className="h-3 w-3" />}
              <span>
                {isProcessing ? "Processing..." : `I understand, ${actionLabel}`}
              </span>
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-text-secondary leading-relaxed">
            {confirmationPrompt ?? (
              <>
                To proceed, please type{" "}
                <code className="px-1.5 py-0.5 rounded bg-brand-tint border border-brand/40 font-mono text-brand dark:text-brand-text font-bold text-xs select-all">
                  {expectedSlug}
                </code>{" "}
                below to confirm.
              </>
            )}
          </p>

          <Input
            type="text"
            value={typedSlug}
            onChange={(e) => setTypedSlug(e.target.value)}
            placeholder="Type slug to confirm"
            disabled={isProcessing}
            className="font-mono text-sm border-border-strong focus:border-brand focus:ring-brand/20"
            autoFocus
          />
        </div>
      </Modal>
    </>
  );
}
