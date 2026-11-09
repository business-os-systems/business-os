"use client";

import React from "react";
import { ShieldIcon } from "@suite/ui/icons";
import type { SupportSessionView } from "@/lib/support-session-client";
import {
  SUPPORT_SESSION_BANNER_COPY,
  formatSupportSessionExpiry,
} from "./support-session-banner.config";

interface SupportSessionBannerProps {
  readonly session: SupportSessionView;
}

/**
 * Persistent, non-dismissible support-session banner (FR-048). It has no close
 * control on purpose: the only way to remove it is to end the session.
 */
export function SupportSessionBanner({ session }: SupportSessionBannerProps) {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={SUPPORT_SESSION_BANNER_COPY.label}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/40 bg-warning/10 px-4 py-2 text-text"
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold text-warning">
        <ShieldIcon className="h-3.5 w-3.5" aria-hidden="true" />
        {SUPPORT_SESSION_BANNER_COPY.label}
      </span>
      <span className="text-xs text-text-secondary">
        {SUPPORT_SESSION_BANNER_COPY.operatorPrefix}:{" "}
        <span className="font-medium text-text">{session.operatorDisplayName}</span>
      </span>
      <span className="text-xs text-text-secondary">
        {SUPPORT_SESSION_BANNER_COPY.expiresPrefix}:{" "}
        <span className="font-medium text-text">
          {formatSupportSessionExpiry(session.expiresAt)}
        </span>
      </span>
      <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        {SUPPORT_SESSION_BANNER_COPY.readOnly}
      </span>
    </section>
  );
}
