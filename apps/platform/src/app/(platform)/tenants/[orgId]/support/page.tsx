"use client";

import { useState } from "react";
import { Alert, Button } from "@suite/ui";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import {
  CapabilityDeniedView,
  PlatformViewState,
} from "@/components/states/view-state";
import { hasPlatformCapability } from "@/lib/capability";
import type {
  PlatformSupportSession,
  StartSupportSessionResult,
} from "@/lib/support-session-api";
import { useActiveSupportSessions } from "@/lib/use-active-support-sessions";
import { useTenantRecord } from "../tenant-record-context";
import { StartSupportSessionModal } from "./start-support-session-modal";
import { SUPPORT_SESSION_COPY } from "./support-session-form.config";
import { SupportSessionList } from "./support-session-list";
import { SupportSessionTicket } from "./support-session-ticket";

function SupportPageHeader({ onStart }: { readonly onStart: () => void }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">
          {SUPPORT_SESSION_COPY.pageTitle}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          {SUPPORT_SESSION_COPY.pageDescription}
        </p>
      </div>
      <Button onClick={onStart}>{SUPPORT_SESSION_COPY.start}</Button>
    </header>
  );
}

interface SupportPageContentProps {
  readonly organizationId: string;
  readonly sessions: readonly PlatformSupportSession[];
  readonly started: StartSupportSessionResult | null;
  readonly isStarting: boolean;
  readonly onStart: () => void;
  readonly onClose: () => void;
  readonly onStarted: (result: StartSupportSessionResult) => void;
  readonly onEnded: () => void;
}

function SupportPageContent({
  organizationId,
  sessions,
  started,
  isStarting,
  onStart,
  onClose,
  onStarted,
  onEnded,
}: SupportPageContentProps) {
  return (
    <div className="space-y-4">
      <SupportPageHeader onStart={onStart} />
      <Alert variant="warning" message={SUPPORT_SESSION_COPY.readOnly} />
      {started === null ? null : <SupportSessionTicket result={started} />}
      <SupportSessionList sessions={sessions} onEnded={onEnded} />
      {isStarting ? (
        <StartSupportSessionModal
          organizationId={organizationId}
          onClose={onClose}
          onStarted={onStarted}
        />
      ) : null}
    </div>
  );
}

export default function TenantSupportPage() {
  const { record } = useTenantRecord();
  const { session } = usePlatformAuth();
  const allowed = hasPlatformCapability(
    session?.capabilities,
    PLATFORM_CAPABILITIES.IMPERSONATE.code,
  );
  const { state, reload } = useActiveSupportSessions({ enabled: allowed });
  const [isStarting, setIsStarting] = useState(false);
  const [started, setStarted] = useState<StartSupportSessionResult | null>(null);

  if (!allowed) {
    return (
      <CapabilityDeniedView message="Your operator account cannot start support sessions." />
    );
  }
  if (state.kind === "loading") {
    return (
      <PlatformViewState
        state={{ kind: "loading", label: "Loading support sessions..." }}
      />
    );
  }
  if (state.kind === "error") {
    return (
      <PlatformViewState
        state={{
          kind: "error",
          problem: {
            status: null,
            title: "Could not load support sessions",
            detail: state.message,
            code: null,
            requestId: null,
            invalidParams: [],
          },
          onRetry: () => void reload(),
        }}
      />
    );
  }

  function onStarted(result: StartSupportSessionResult): void {
    setStarted(result);
    setIsStarting(false);
    void reload();
  }

  return (
    <SupportPageContent
      organizationId={record.profile.id}
      sessions={state.sessions.filter(
        (item) => item.organizationId === record.profile.id,
      )}
      started={started}
      isStarting={isStarting}
      onStart={() => setIsStarting(true)}
      onClose={() => setIsStarting(false)}
      onStarted={onStarted}
      onEnded={() => void reload()}
    />
  );
}
