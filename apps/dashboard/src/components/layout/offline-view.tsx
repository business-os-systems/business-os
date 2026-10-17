"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Button } from "@suite/ui";
import { RotateCcwIcon, WifiOffIcon } from "@suite/ui/icons";
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
const RETRY_FEEDBACK_DELAY_MS = 600;
const OFFLINE_PROBE_DELAY_MS = 500;

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
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [handleOnline, handleOffline]);

  const handleRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
    }
    setIsRetrying(true);

    if (onRetry) {
      onRetry();
      retryTimerRef.current = setTimeout(() => {
        setIsRetrying(false);
      }, RETRY_FEEDBACK_DELAY_MS);
      return;
    }

    if (isBrowser) {
      if (navigator.onLine) {
        setIsOnline(true);
        window.location.reload();
      } else {
        retryTimerRef.current = setTimeout(() => {
          setIsRetrying(false);
        }, OFFLINE_PROBE_DELAY_MS);
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
          <WifiOffIcon size={24} className="text-text-muted" />
        </div>


        {/* Heading & Microcopy */}
        <h2 className="text-lg font-semibold text-text tracking-tight mb-2">
          {title}
        </h2>
        <p className="text-sm text-text-muted leading-relaxed mb-6">
          {description}
        </p>

        {/* Action: Retry Connection CTA */}
        <Button
          type="button"
          variant="primary"
          onClick={handleRetry}
          disabled={isRetrying}
          isLoading={isRetrying}
          className="h-10 px-5"
          startIcon={
            !isRetrying && (
              <RotateCcwIcon
                size={16}
                aria-hidden="true"
              />
            )
          }
        >
          {isRetrying ? "Checking connection..." : retryLabel}
        </Button>
      </div>
    </div>
  );
}
