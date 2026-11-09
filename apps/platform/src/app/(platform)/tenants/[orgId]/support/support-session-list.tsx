"use client";

import { useState } from "react";
import { Alert } from "@suite/ui";
import { PlatformViewState } from "@/components/states/view-state";
import { toMessage } from "@/lib/error-message";
import {
  endSupportSession,
  type PlatformSupportSession,
} from "@/lib/support-session-api";
import { ActiveSupportSessionCard } from "./active-support-session-card";
import { SUPPORT_SESSION_COPY } from "./support-session-form.config";

export function SupportSessionList({
  sessions,
  onEnded,
}: {
  readonly sessions: readonly PlatformSupportSession[];
  readonly onEnded: () => void;
}) {
  const [endingId, setEndingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function end(ticketId: string): Promise<void> {
    setEndingId(ticketId);
    setError(null);
    try {
      await endSupportSession(ticketId);
      onEnded();
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setEndingId(null);
    }
  }

  if (sessions.length === 0) {
    return (
      <PlatformViewState
        state={{
          kind: "empty",
          title: SUPPORT_SESSION_COPY.emptyTitle,
          description: SUPPORT_SESSION_COPY.emptyDescription,
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {error === null ? null : <Alert variant="error" message={error} />}
      {sessions.map((session) => (
        <ActiveSupportSessionCard
          key={session.ticketId}
          session={session}
          ending={endingId === session.ticketId}
          onEnd={(ticketId) => void end(ticketId)}
        />
      ))}
    </div>
  );
}
