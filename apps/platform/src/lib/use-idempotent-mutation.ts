"use client";

import { useState } from "react";
import { AppError } from "@suite/core/errors";
import { createIdempotencyKey } from "./api";
import { toMessage } from "./error-message";

/**
 * One audited-mutation lifecycle for the Platform modals. A key is kept across
 * retries of the same logical request, rotated after success so the next
 * request cannot replay the previous response, and rotated after a 4xx.
 */
export function useIdempotentMutation() {
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(
    work: (idempotencyKey: string) => Promise<T>,
    onSuccess: (value: T) => void,
  ): Promise<void> {
    setIsSaving(true);
    setError(null);
    try {
      const value = await work(idempotencyKey);
      setIdempotencyKey(createIdempotencyKey());
      onSuccess(value);
    } catch (cause) {
      if (cause instanceof AppError && cause.status >= 400 && cause.status < 500) {
        setIdempotencyKey(createIdempotencyKey());
      }
      setError(toMessage(cause));
    } finally {
      setIsSaving(false);
    }
  }

  return { isSaving, error, setError, run };
}
