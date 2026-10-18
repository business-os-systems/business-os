"use client";

import React from "react";
import { cn } from "../lib/utils.js";
import { Button } from "./button.js";
import { Spinner } from "./spinner.js";

export interface StickyActionBarProps {
  /**
   * Whether the sticky action bar should be rendered/visible.
   * Typically tied to form dirty state.
   */
  visible?: boolean;
  /**
   * Whether the form currently has pending, unsaved modifications.
   */
  isDirty?: boolean;
  /**
   * Whether a save operation is in-flight.
   */
  isSaving?: boolean;
  /**
   * Label for the primary save action.
   */
  saveLabel?: string;
  /**
   * Label for the discard action.
   */
  discardLabel?: string;
  /**
   * Whether to display the discard button.
   */
  showDiscard?: boolean;
  /**
   * Status prompt displayed on the left side of the action bar.
   */
  statusPrompt?: string;
  /**
   * Callback invoked when the user confirms discarding changes.
   */
  onDiscard?: () => void;
  /**
   * Callback invoked when the user triggers the save action.
   * If omitted, button functions as form submit trigger (type="submit").
   */
  onSave?: () => void | Promise<void>;
  /**
   * Optional custom CSS class name for outer wrapper.
   */
  className?: string;
}

/**
 * StickyActionBar
 *
 * Persistent sticky footer action bar anchored to the bottom of the viewport.
 * Provides backdrop blur and save/discard triggers for settings forms and dashboards.
 */
export function StickyActionBar({
  visible = true,
  isDirty = false,
  isSaving = false,
  saveLabel = "Save changes",
  discardLabel = "Discard",
  showDiscard = true,
  statusPrompt = "Careful — you have unsaved changes!",
  onDiscard,
  onSave,
  className = "",
}: StickyActionBarProps) {
  if (!visible) {
    return null;
  }

  const handleSaveClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (onSave) {
      event.preventDefault();
      void onSave();
    }
  };

  return (
    <div
      role="region"
      aria-label="Form actions"
      className={cn(
        "sticky bottom-0 left-0 right-0 z-30 w-full border-t border-border bg-surface shadow-md px-4 py-3 sm:px-6 transition-all duration-200",
        className,
      )}
    >
      <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2">
          {isDirty ? (
            <span className="flex items-center gap-2 text-xs font-medium text-warning">
              <span
                className="inline-block h-2 w-2 rounded-full bg-warning animate-pulse"
                aria-hidden="true"
              />
              {statusPrompt}
            </span>
          ) : (
            <span className="text-xs text-text-muted">All changes saved</span>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {showDiscard && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSaving || !isDirty}
              onClick={onDiscard}
              className="text-xs font-medium flex-1 sm:flex-initial justify-center"
            >
              {discardLabel}
            </Button>
          )}

          <Button
            type={onSave ? "button" : "submit"}
            variant="default"
            size="sm"
            disabled={isSaving || !isDirty}
            onClick={onSave ? handleSaveClick : undefined}
            className="text-xs font-medium inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
          >
            {isSaving && <Spinner size="sm" className="h-3 w-3" />}
            <span>{isSaving ? "Saving..." : saveLabel}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
