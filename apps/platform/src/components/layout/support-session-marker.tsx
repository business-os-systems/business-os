"use client";

import { useCallback, useState } from "react";
import { Alert, Button, Spinner } from "@suite/ui";
import { ShieldIcon } from "@suite/ui/icons";
import { toMessage } from "@/lib/error-message";
import {
  endSupportSession,
  type PlatformSupportSession,
} from "@/lib/support-session-api";
import { useActiveSupportSessions } from "@/lib/use-active-support-sessions";
import {
  formatSupportSessionExpiry,
  SUPPORT_SESSION_MARKER_COPY,
} from "./support-session-marker.config";

interface SupportSessionRowProps {
  readonly session: PlatformSupportSession;
  readonly ending: boolean;
  readonly onExit: (ticketId: string) => void;
}

interface ActiveMarkerProps {
  readonly sessions: readonly PlatformSupportSession[];
  readonly endingTicketId: string | null;
  readonly exitError: string | null;
  readonly onExit: (ticketId: string) => void;
}

function MarkerLoading() {
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-border bg-surface px-3 py-1.5 text-xs text-text-muted sm:px-5"
    >
      <Spinner size="sm" />
      <span>{SUPPORT_SESSION_MARKER_COPY.loading}</span>
    </div>
  );
}

function MarkerUnavailable({ message }: { readonly message: string }) {
  return (
    <div className="border-b border-border bg-surface px-3 py-2 sm:px-5">
      <Alert
        variant="warning"
        title={SUPPORT_SESSION_MARKER_COPY.loadErrorTitle}
        message={message}
      />
    </div>
  );
}

function SupportSessionRow({ session, ending, onExit }: SupportSessionRowProps) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
      <span className="font-medium text-text">
        {SUPPORT_SESSION_MARKER_COPY.operatorLabel}
      </span>
      <span>
        {SUPPORT_SESSION_MARKER_COPY.reasonPrefix}:{" "}
        <span className="text-text">{session.reason}</span>
      </span>
      <span>
        {SUPPORT_SESSION_MARKER_COPY.ticketPrefix}:{" "}
        <span className="font-mono text-text">{session.ticketRef}</span>
      </span>
      <span>
        {SUPPORT_SESSION_MARKER_COPY.expiresPrefix}:{" "}
        <span className="font-medium text-text">
          {formatSupportSessionExpiry(session.expiresAt)}
        </span>
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6 px-2 text-[11px]"
        disabled={ending}
        onClick={() => onExit(session.ticketId)}
      >
        {ending
          ? SUPPORT_SESSION_MARKER_COPY.ending
          : SUPPORT_SESSION_MARKER_COPY.exit}
      </Button>
    </span>
  );
}

function ActiveMarker({
  sessions,
  endingTicketId,
  exitError,
  onExit,
}: ActiveMarkerProps) {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={SUPPORT_SESSION_MARKER_COPY.label}
      className="border-b border-warning/40 bg-warning/10 px-3 py-1.5 sm:px-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-warning">
          <ShieldIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {SUPPORT_SESSION_MARKER_COPY.label}
        </span>
        {sessions.map((session) => (
          <SupportSessionRow
            key={session.ticketId}
            session={session}
            ending={endingTicketId === session.ticketId}
            onExit={onExit}
          />
        ))}
      </div>
      {exitError === null ? null : (
        <div className="mt-1.5">
          <Alert
            variant="error"
            title={SUPPORT_SESSION_MARKER_COPY.exitErrorTitle}
            message={exitError}
          />
        </div>
      )}
    </section>
  );
}

/**
 * Persistent Platform marker that distinguishes a read-only support session
 * from normal operator use (FR-096). It has no dismiss control: only ending the
 * session removes it, and the tenant-facing banner stays authoritative.
 */
export function SupportSessionMarker() {
  const { state, remove } = useActiveSupportSessions({ enabled: true });
  const [endingTicketId, setEndingTicketId] = useState<string | null>(null);
  const [exitError, setExitError] = useState<string | null>(null);

  const handleExit = useCallback(async (ticketId: string): Promise<void> => {
    setEndingTicketId(ticketId);
    setExitError(null);
    try {
      await endSupportSession(ticketId);
      remove(ticketId);
    } catch (error) {
      setExitError(toMessage(error));
    } finally {
      setEndingTicketId(null);
    }
  }, [remove]);

  if (state.kind === "loading") {
    return <MarkerLoading />;
  }
  if (state.kind === "error") {
    return <MarkerUnavailable message={state.message} />;
  }
  if (state.sessions.length === 0) {
    return null;
  }
  return (
    <ActiveMarker
      sessions={state.sessions}
      endingTicketId={endingTicketId}
      exitError={exitError}
      onExit={(ticketId) => void handleExit(ticketId)}
    />
  );
}
