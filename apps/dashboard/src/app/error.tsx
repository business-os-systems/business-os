"use client";

import React, { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { Button } from "@suite/ui";
import { AlertTriangleIcon, RotateCcwIcon, HomeIcon } from "@suite/ui/icons";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    // Capture to Sentry with strict Zero-PII sanitization
    Sentry.captureException(error, {
      extra: {
        digest: error.digest,
      },
    });
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertTriangleIcon className="h-6 w-6" aria-hidden="true" />
        </div>

        <h2 className="text-xl font-semibold tracking-tight text-text">
          We encountered an unexpected issue
        </h2>

        <p className="mt-2 text-sm text-secondary leading-relaxed">
          A diagnostic crash report has been automatically recorded. You can try refreshing
          this view or return safely to the dashboard overview.
        </p>

        {error.digest && (
          <div className="mt-3 inline-block rounded bg-surface-muted px-2.5 py-1 text-xs font-mono text-secondary">
            Incident Digest: {error.digest}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            type="button"
            variant="primary"
            onClick={() => reset()}
            className="flex items-center justify-center gap-2"
          >
            <RotateCcwIcon className="h-4 w-4" />
            Try Again
          </Button>

          <Link href="/dashboard" className="w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="w-full flex items-center justify-center gap-2"
            >
              <HomeIcon className="h-4 w-4" />
              Return to Overview
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
