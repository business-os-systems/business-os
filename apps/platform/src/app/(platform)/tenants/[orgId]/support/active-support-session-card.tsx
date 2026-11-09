"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@suite/ui";
import { formatSupportSessionExpiry } from "@/components/layout/support-session-marker.config";
import type { PlatformSupportSession } from "@/lib/support-session-api";
import { SUPPORT_SESSION_COPY } from "./support-session-form.config";

export function ActiveSupportSessionCard({
  session,
  ending,
  onEnd,
}: {
  readonly session: PlatformSupportSession;
  readonly ending: boolean;
  readonly onEnd: (ticketId: string) => void;
}) {
  return (
    <Card className="border border-border bg-surface">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Active support session</CardTitle>
          <p className="mt-1 text-xs text-text-secondary">
            {SUPPORT_SESSION_COPY.readOnly}
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          disabled={ending}
          onClick={() => onEnd(session.ticketId)}
        >
          {ending ? SUPPORT_SESSION_COPY.ending : SUPPORT_SESSION_COPY.end}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm text-text-secondary sm:grid-cols-2">
        <p>
          <span className="font-medium text-text">Reason:</span>{" "}
          {session.reason}
        </p>
        <p>
          <span className="font-medium text-text">Ticket:</span>{" "}
          <span className="font-mono text-xs text-text">{session.ticketRef}</span>
        </p>
        <p>
          <span className="font-medium text-text">Expires:</span>{" "}
          {formatSupportSessionExpiry(session.expiresAt)}
        </p>
        <p>
          <span className="font-medium text-text">Started:</span>{" "}
          {formatSupportSessionExpiry(session.startedAt)}
        </p>
      </CardContent>
    </Card>
  );
}
