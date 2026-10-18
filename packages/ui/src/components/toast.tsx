"use client";

import React from "react";
import { Toaster as SonnerToaster, toast } from "sonner";
import {
  CheckIcon,
  AlertCircleIcon,
  InfoIcon,
  XIcon,
} from "../icons/index.js";
import { Spinner } from "./spinner.js";

export type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

/**
 * Universal Toaster Primitive (@suite/ui)
 *
 * Backed by Sonner with full DESIGN.md token integration, smooth card stacking,
 * responsive positioning below platform topbar, auto-dismiss, and accessibility.
 */
export function Toaster({
  position = "top-right",
  duration = 5000,
  closeButton = true,
  richColors = false,
  offset = { top: "80px", right: "24px" },
  mobileOffset = { top: "72px", right: "16px", left: "16px" },
  ...props
}: ToasterProps) {
  return (
    <SonnerToaster
      position={position}
      duration={duration}
      closeButton={closeButton}
      richColors={richColors}
      offset={offset}
      mobileOffset={mobileOffset}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-surface group-[.toaster]:text-text group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:shadow-level-2 group-[.toaster]:rounded-xl group-[.toaster]:font-sans text-sm py-3.5 pl-4 pr-11 flex items-center gap-3 relative",
          content: "flex-1 text-sm font-normal text-text",
          title: "text-sm font-medium text-text",
          description: "group-[.toast]:text-text-secondary text-xs mt-1",
          actionButton:
            "group-[.toast]:bg-action group-[.toast]:text-white group-[.toast]:hover:bg-action-hover font-medium rounded-lg text-xs px-3 py-1.5",
          cancelButton:
            "group-[.toast]:bg-surface-elevated group-[.toast]:text-text group-[.toast]:border group-[.toast]:border-border rounded-lg text-xs px-3 py-1.5",
          closeButton:
            "!left-auto !right-3 !top-1/2 !-translate-y-1/2 !translate-x-0 !transform !opacity-70 hover:!opacity-100 !h-6 !w-6 !rounded-md !bg-transparent !border-0 text-text-secondary hover:text-text flex items-center justify-center transition-opacity cursor-pointer",
          success:
            "group-[.toaster]:border-emerald-500/30 group-[.toaster]:bg-surface text-text [&_[data-icon]]:text-emerald-500",
          error:
            "group-[.toaster]:border-danger/30 group-[.toaster]:bg-surface text-text [&_[data-icon]]:text-danger",
          warning:
            "group-[.toaster]:border-warning/30 group-[.toaster]:bg-surface text-text [&_[data-icon]]:text-warning",
          info:
            "group-[.toaster]:border-action/30 group-[.toaster]:bg-surface text-text [&_[data-icon]]:text-action",
        },
      }}
      icons={{
        success: <CheckIcon className="h-4 w-4 text-emerald-500 stroke-[2.5]" />,
        error: <AlertCircleIcon className="h-4 w-4 text-danger stroke-[2.5]" />,
        warning: <AlertCircleIcon className="h-4 w-4 text-warning stroke-[2.5]" />,
        info: <InfoIcon className="h-4 w-4 text-action stroke-[2.5]" />,
        loading: <Spinner size="sm" className="h-4 w-4 text-text-secondary" />,
        close: <XIcon className="h-3.5 w-3.5 stroke-[2.5]" />,
      }}
      {...props}
    />
  );
}

export { toast };
