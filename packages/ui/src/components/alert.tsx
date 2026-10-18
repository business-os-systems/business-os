"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils.js";
import { Button } from "./button.js";
import { isBrowser } from "../env.js";
import {
  CheckIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  XIcon,
} from "../icons/index.js";

export type AlertVariant = "success" | "error" | "warning" | "info";
export type ToastPosition =
  | "top-right"
  | "top-center"
  | "top-left"
  | "bottom-right"
  | "inline";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  message?: React.ReactNode;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  showIcon?: boolean;
  dismissible?: boolean;
  autoDismissMs?: number;
  onDismiss?: () => void;
  /**
   * If true, renders as a floating toast above all elements at z-[60].
   */
  isToast?: boolean;
  /**
   * Screen placement for floating toast mode. Defaults to "top-right".
   */
  position?: ToastPosition;
}

const variantContainerStyles: Record<AlertVariant, string> = {
  success:
    "border-success/40 bg-success/10 dark:bg-success/20 dark:border-success/50 text-success dark:text-success",
  error:
    "border-danger/40 bg-danger/10 dark:bg-danger/20 dark:border-danger/50 text-danger dark:text-danger",
  warning:
    "border-warning/40 bg-warning/10 dark:bg-warning/20 dark:border-warning/50 text-warning-text dark:text-warning",
  info: "border-border bg-surface-muted text-text-secondary",
};

const variantBadgeStyles: Record<AlertVariant, string> = {
  success: "bg-success/20 text-success dark:text-success",
  error: "bg-danger/20 text-danger dark:text-danger",
  warning: "bg-warning/20 text-warning dark:text-warning",
  info: "bg-surface-sunken text-text-secondary",
};

const variantCloseButtonStyles: Record<AlertVariant, string> = {
  success: "text-success/70 hover:text-success hover:bg-success/20",
  error: "text-danger/70 hover:text-danger hover:bg-danger/20",
  warning: "text-warning/70 hover:text-warning hover:bg-warning/20",
  info: "text-text-muted hover:text-text hover:bg-surface-sunken",
};

const positionStyles: Record<ToastPosition, string> = {
  "top-right":
    "fixed top-5 right-5 z-[60] max-w-md w-[calc(100vw-2.5rem)] shadow-2xl animate-in slide-in-from-top-3 fade-in duration-200",
  "top-center":
    "fixed top-5 left-1/2 -translate-x-1/2 z-[60] max-w-md w-[calc(100vw-2.5rem)] shadow-2xl animate-in slide-in-from-top-3 fade-in duration-200",
  "top-left":
    "fixed top-5 left-5 z-[60] max-w-md w-[calc(100vw-2.5rem)] shadow-2xl animate-in slide-in-from-top-3 fade-in duration-200",
  "bottom-right":
    "fixed bottom-5 right-5 z-[60] max-w-md w-[calc(100vw-2.5rem)] shadow-2xl animate-in slide-in-from-bottom-3 fade-in duration-200",
  inline: "",
};

function getDefaultIcon(variant: AlertVariant) {
  switch (variant) {
    case "success":
      return <CheckIcon className="h-4 w-4 stroke-[2.5]" />;
    case "error":
      return <AlertCircleIcon className="h-4 w-4 stroke-[2.5]" />;
    case "warning":
      return <AlertTriangleIcon className="h-4 w-4 stroke-[2.5]" />;
    case "info":
    default:
      return <AlertCircleIcon className="h-4 w-4 stroke-[2.5]" />;
  }
}

/**
 * Alert
 *
 * Standardized status notification and feedback banner adhering to DESIGN.md tokens.
 * When isToast is true (or position is non-inline), it renders via React Portal
 * to document.body at z-[60], floating above all headers, sidebars, and modals.
 */
export function Alert({
  variant = "info",
  title,
  message,
  children,
  icon,
  showIcon = true,
  dismissible = false,
  autoDismissMs,
  onDismiss,
  isToast = false,
  position = isToast ? "top-right" : "inline",
  className,
  ...props
}: AlertProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!autoDismissMs || autoDismissMs <= 0 || !onDismiss) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, onDismiss]);

  const resolvedIcon = icon ?? (showIcon ? getDefaultIcon(variant) : null);
  const content = message ?? children;
  const isFloating = position !== "inline";

  const alertContent = (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-xl border px-4 py-3 flex items-center justify-between gap-3 text-sm shadow-sm transition-all duration-200",
        isFloating ? positionStyles[position] : "animate-in fade-in duration-200",
        variantContainerStyles[variant],
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {resolvedIcon && (
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full shrink-0",
              variantBadgeStyles[variant],
            )}
          >
            {resolvedIcon}
          </div>
        )}

        <div className="flex flex-col min-w-0">
          {title && (
            <span className="font-semibold text-xs uppercase tracking-wider mb-0.5">
              {title}
            </span>
          )}
          {content && (
            <span className="font-medium truncate sm:whitespace-normal">
              {content}
            </span>
          )}
        </div>
      </div>

      {(dismissible || onDismiss) && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          aria-label="Dismiss alert"
          className={cn(
            "h-7 w-7 p-1 rounded-lg shrink-0",
            variantCloseButtonStyles[variant],
          )}
        >
          <XIcon className="h-4 w-4 stroke-[2.5]" />
        </Button>
      )}
    </div>
  );

  if (isFloating) {
    if (!isMounted) return null;
    return isBrowser && document.body
      ? createPortal(alertContent, document.body)
      : alertContent;
  }

  return alertContent;
}

/**
 * Toast
 *
 * Floating toast notification variant that mounts via portal at z-[60] above all content.
 */
export function Toast(props: Omit<AlertProps, "isToast">) {
  return <Alert isToast position="top-right" {...props} />;
}
