"use client";

import React, { useEffect, useState, useCallback } from "react";
import { RotateCcwIcon } from "@suite/ui/icons";
import { isBrowser } from "@/lib/env";

/**
 * Text and content configuration for the offline view (ISP).
 */
export interface OfflineViewMetadata {
  title?: string;
  description?: string;
  retryLabel?: string;
}

/**
 * Event handling callbacks for the offline view (ISP).
 */
export interface OfflineViewActions {
  onRetry?: () => void;
  onStatusChange?: (isOnline: boolean) => void;
}

/**
 * Composite props interface for OfflineView.
 */
export interface OfflineViewProps extends OfflineViewMetadata, OfflineViewActions {
  className?: string;
  isStandalone?: boolean;
}

/**
 * Offline Connectivity Guard & Presentation Boundary.
 * Complies with SPEC-AUTH-001 Section 6.1 (Network Check) & Transition Matrix.
 * Displays an accessible, centered offline indicator with a 'Retry connection' CTA
 * when network connection drops or on native launch.
 */
export function OfflineView({
  title = "You are currently offline",
  description = "Your network connection was lost. Please check your internet connectivity to resume working in Business OS.",
  retryLabel = "Retry connection",
  onRetry,
  onStatusChange,
  className = "",
  isStandalone = true,
}: OfflineViewProps) {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return isBrowser ? navigator.onLine : true;
  });
  const [isRetrying, setIsRetrying] = useState(false);

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    onStatusChange?.(true);
  }, [onStatusChange]);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    onStatusChange?.(false);
  }, [onStatusChange]);

  useEffect(() => {
    if (!isBrowser) return;

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [handleOnline, handleOffline]);

  const handleRetry = useCallback(() => {
    setIsRetrying(true);

    if (onRetry) {
      onRetry();
      setTimeout(() => setIsRetrying(false), 600);
      return;
    }

    if (isBrowser) {
      if (navigator.onLine) {
        setIsOnline(true);
        window.location.reload();
      } else {
        setTimeout(() => setIsRetrying(false), 500);
      }
    }
  }, [onRetry]);

  // If used as an automatic reactive boundary and the browser is online, render nothing
  if (!isStandalone && isOnline) {
    return null;
  }

  const containerStyle = isStandalone
    ? "min-h-[360px] w-full flex items-center justify-center p-6"
    : "fixed inset-0 z-50 flex items-center justify-center bg-surface/80 backdrop-blur-sm p-4";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${containerStyle} ${className}`}
    >
      <div className="w-full max-w-[420px] rounded-lg border border-border bg-surface p-8 shadow-sm text-center flex flex-col items-center">
        {/* Offline / Disconnected SVG Glyph */}
        <div
          className="w-12 h-12 rounded-full bg-surface-muted flex items-center justify-center mb-4 text-text-muted"
          aria-hidden="true"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-text-muted"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        </div>

        {/* Heading & Microcopy */}
        <h2 className="text-lg font-semibold text-text tracking-tight mb-2">
          {title}
        </h2>
        <p className="text-sm text-text-muted leading-relaxed mb-6">
          {description}
        </p>

        {/* Action: Retry Connection CTA */}
        <button
          type="button"
          onClick={handleRetry}
          disabled={isRetrying}
          className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-md bg-action hover:bg-action-hover text-action-contrast text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          <RotateCcwIcon
            size={16}
            className={isRetrying ? "animate-spin" : ""}
            aria-hidden="true"
          />
          <span>{isRetrying ? "Checking connection..." : retryLabel}</span>
        </button>
      </div>
    </div>
  );
}
