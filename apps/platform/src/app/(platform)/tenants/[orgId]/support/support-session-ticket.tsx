"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@suite/ui";
import { formatSupportSessionExpiry } from "@/components/layout/support-session-marker.config";
import { toMessage } from "@/lib/error-message";
import type { StartSupportSessionResult } from "@/lib/support-session-api";

/**
 * The signed ticket is returned once. It is a bearer credential for read-only
 * tenant API calls, so the UI shows it once, never logs it, and tells the
 * operator how to recover (end the session and start a new one).
 */
export function SupportSessionTicket({
  result,
}: {
  readonly result: StartSupportSessionResult;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copy(): Promise<void> {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(result.tenantBannerToken);
      setCopied(true);
    } catch (error) {
      setCopyError(toMessage(error));
    }
  }

  return (
    <Card className="border border-warning/40 bg-warning/5">
      <CardHeader>
        <CardTitle className="text-base">Support session started</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-text-secondary">
          Attach this signed ticket as{" "}
          <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-xs text-text">
            X-Support-Session
          </code>{" "}
          on read-only tenant API calls. It expires at{" "}
          <span className="font-medium text-text">
            {formatSupportSessionExpiry(result.expiresAt)}
          </span>
          .
        </p>
        <code className="block break-all rounded-lg border border-border bg-surface p-3 font-mono text-xs text-text">
          {result.tenantBannerToken}
        </code>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy ticket"}
          </Button>
          <span className="text-xs text-text-muted">
            Shown once. If it is lost, end the session and start a new one.
          </span>
        </div>
        {copyError === null ? null : (
          <Alert variant="error" message={copyError} />
        )}
      </CardContent>
    </Card>
  );
}
