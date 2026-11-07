"use client";

import { useState } from "react";
import { AppError } from "@suite/core/errors";
import { createIdempotencyKey } from "./api";
import { toMessage } from "./error-message";

export type MutationOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown };

/**
 * One audited-mutation lifecycle for the Platform modals. A key is kept across
 * retries of the same logical request, rotated after success so the next
 * request cannot replay the previous response, and rotated after a 4xx.
 */
export function useIdempotentMutation() {
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cause, setCause] = useState<unknown>(null);

  async function run<T>(
    work: (idempotencyKey: string) => Promise<T>,
    onSuccess: (value: T) => void,
  ): Promise<MutationOutcome<T>> {
    setIsSaving(true);
    setError(null);
    setCause(null);
    try {
      const value = await work(idempotencyKey);
      setIdempotencyKey(createIdempotencyKey());
      onSuccess(value);
      return { ok: true, value };
    } catch (cause) {
      if (cause instanceof AppError && cause.status >= 400 && cause.status < 500) {
        setIdempotencyKey(createIdempotencyKey());
      }
      setCause(cause);
      setError(toMessage(cause));
      return { ok: false, error: cause };
    } finally {
      setIsSaving(false);
    }
  }

  return { isSaving, error, cause, setError, run };
}
