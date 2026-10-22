"use client";

import React, { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error, {
      extra: {
        digest: error.digest,
      },
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background p-4 text-text font-sans antialiased">
        <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h2 className="text-xl font-semibold tracking-tight text-text">
            Critical System Encounter
          </h2>

          <p className="mt-2 text-sm text-secondary leading-relaxed">
            The platform encountered an unexpected layout anomaly. Our engineering team has
            been alerted via diagnostic telemetry.
          </p>

          {error.digest && (
            <div className="mt-3 inline-block rounded bg-surface-muted px-2.5 py-1 text-xs font-mono text-secondary">
              Digest: {error.digest}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex items-center justify-center rounded-lg bg-action px-4 py-2 text-sm font-medium text-action-text transition-colors hover:bg-action-hover focus:outline-none"
            >
              Reload Application
            </button>
            <a
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-hover focus:outline-none"
            >
              Go to Overview
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
