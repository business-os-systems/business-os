"use client";

import { useState } from "react";
import { toMessage } from "@/lib/error-message";

export interface CatalogMutation {
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly cause: unknown;
  readonly run: <T>(
    work: () => Promise<T>,
    onSuccess: (value: T) => void,
  ) => Promise<void>;
}

/**
 * Catalog mutations are not in the documented Idempotency-Key allow-list,
 * so this lifecycle deliberately omits a key. It still keeps the RFC
 * 7807 detail and the typed cause so a conflict can offer a reload.
 */
export function useCatalogMutation(): CatalogMutation {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cause, setCause] = useState<unknown>(null);

  async function run<T>(
    work: () => Promise<T>,
    onSuccess: (value: T) => void,
  ): Promise<void> {
    setIsSaving(true);
    setError(null);
    setCause(null);
    try {
      onSuccess(await work());
    } catch (nextCause) {
      setCause(nextCause);
      setError(toMessage(nextCause));
    } finally {
      setIsSaving(false);
    }
  }

  return { isSaving, error, cause, run };
}
