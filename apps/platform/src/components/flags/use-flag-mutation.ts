"use client";

import { useState } from "react";
import { AppError } from "@suite/core/errors";
import { toMessage } from "@/lib/error-message";
import { createFlagIdempotencyKey } from "@/lib/flags-api";

/**
 * Shared mutation lifecycle for the flag modals: one idempotency key per
 * attempt, a 4xx rotates the key, and the same error text reaches the alert.
 */
export function useFlagMutation() {
  const [idempotencyKey, setIdempotencyKey] = useState(createFlagIdempotencyKey);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(
    work: (idempotencyKey: string) => Promise<T>,
    onSuccess: (value: T) => void
  ): Promise<void> {
    setIsSaving(true);
    setError(null);
    try {
      onSuccess(await work(idempotencyKey));
    } catch (cause) {
      if (
        cause instanceof AppError &&
        cause.status >= 400 &&
        cause.status < 500
      ) {
        setIdempotencyKey(createFlagIdempotencyKey());
      }
      setError(toMessage(cause));
    } finally {
      setIsSaving(false);
    }
  }

  return { isSaving, error, setError, run };
}
