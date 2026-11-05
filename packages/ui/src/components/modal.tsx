"use client";

import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils.js";
import { Button } from "./button.js";
import { XIcon } from "../icons/index.js";
import { isBrowser } from "../env.js";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

export interface ModalProps {
  /**
   * Whether the modal dialog is open and visible.
   */
  isOpen: boolean;
  /**
   * Callback invoked when closing the modal (via backdrop click, Escape key, or close button).
   */
  onClose: () => void;
  /**
   * Modal header title.
   */
  title?: React.ReactNode;
  /**
   * Modal header description or subtitle.
   */
  description?: React.ReactNode;
  /**
   * Main modal body content.
   */
  children?: React.ReactNode;
  /**
   * Action buttons or footer elements.
   */
  footer?: React.ReactNode;
  /**
   * Container width size token.
   */
  size?: ModalSize;
  /**
   * Whether clicking the backdrop overlay closes the modal.
   * Defaults to true.
   */
  closeOnOutsideClick?: boolean;
  /**
   * Whether pressing the Escape key closes the modal.
   * Defaults to true.
   */
  closeOnEscape?: boolean;
  /**
   * Whether to display the top-right close icon button.
   * Defaults to true.
   */
  showCloseButton?: boolean;
  /**
   * Optional custom CSS class name for the modal card container.
   */
  className?: string;
  /**
   * Optional custom CSS class name for the modal body content wrapper.
   */
  contentClassName?: string;
  /**
   * Optional custom CSS class name for the backdrop overlay.
   */
  overlayClassName?: string;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-md w-full",
  md: "max-w-lg w-full",
  lg: "max-w-2xl w-full",
  xl: "max-w-4xl w-full",
  full: "max-w-[calc(100vw-2rem)] w-full",
};

/**
 * Modal
 *
 * Standardized dialog container and backdrop wrapper adhering to DESIGN.md tokens.
 * Renders via React Portal to document.body, ensuring it always displays on top of
 * any local layout stacking contexts.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeOnOutsideClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  className,
  contentClassName,
  overlayClassName,
}: ModalProps) {
  const [isMounted, setIsMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (closeOnEscape && event.key === "Escape") {
        onClose();
      }
    };

    if (isBrowser) {
      document.addEventListener("keydown", handleKeyDown);
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = originalOverflow;
      };
    }
    return;
  }, [isOpen, closeOnEscape, onClose]);

  if (!isMounted || !isOpen) {
    return null;
  }

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200",
        overlayClassName,
      )}
      onClick={(e) => {
        if (closeOnOutsideClick && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={cardRef}
        className={cn(
          "relative rounded-2xl border border-border bg-surface px-5 py-3.5 sm:px-6 sm:py-4 shadow-2xl text-text animate-in zoom-in-95 duration-150 flex flex-col my-auto max-h-[calc(100vh-3rem)] sm:max-h-[calc(100vh-4rem)]",
          sizeClasses[size],
          className,
        )}
      >
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between gap-4 pb-2.5 border-b border-border-hairline">
            <div className="flex flex-col min-w-0 pr-2">
              {title && (
                <h2 className="text-base sm:text-lg font-bold text-text truncate">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
                  {description}
                </p>
              )}
            </div>

            {showCloseButton && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close dialog"
                className="h-7 w-7 p-1 text-text-muted hover:text-text hover:bg-surface-muted rounded-lg shrink-0"
              >
                <XIcon className="h-4 w-4 stroke-[2.5]" />
              </Button>
            )}
          </div>
        )}

        <div
          className={cn(
            "py-2.5 sm:py-3 px-1.5 sm:px-2 flex-1 overflow-y-auto text-sm leading-normal",
            contentClassName,
          )}
        >
          {children}
        </div>

        {footer && (
          <div className="pt-2.5 sm:pt-3 border-t border-border-hairline flex items-center justify-end gap-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return isBrowser && document.body
    ? createPortal(modalContent, document.body)
    : modalContent;
}
