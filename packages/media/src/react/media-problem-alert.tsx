"use client";

import React from "react";
import { Alert, cn } from "@suite/ui";
import { MediaApiError } from "./media-client.js";

export interface MediaProblemAlertProps {
  readonly error: Error;
  readonly title?: string;
  readonly className?: string;
}

function readReferences(error: Error): readonly string[] {
  if (!(error instanceof MediaApiError)) {
    return [];
  }
  return error.invalidParams.map((param) => `${param.name}: ${param.reason}`);
}

/**
 * Transparent RFC 7807 presentation. The API's detail survives verbatim and a
 * deletion refusal lists every referencing location, not a paraphrase.
 */
export function MediaProblemAlert({
  error,
  title = "Media request failed",
  className,
}: MediaProblemAlertProps) {
  const references = readReferences(error);
  return (
    <div className={cn("space-y-2", className)}>
      <Alert
        variant="error"
        role="alert"
        aria-live="assertive"
        title={title}
        message={error.message}
      />
      {references.length > 0 ? (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-3">
          <p className="text-xs font-semibold text-danger">
            Referencing locations
          </p>
          <ul className="mt-1.5 list-disc list-inside space-y-1 text-xs text-text">
            {references.map((reference) => (
              <li key={reference}>{reference}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
