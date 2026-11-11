"use client";

import { useState } from "react";
import { AppError, ConflictError } from "@suite/core/errors";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { createIdempotencyKey } from "@/lib/api";
import { toMessage } from "@/lib/error-message";
import {
  requestSiteTakedown,
  type SiteTakedownAction,
  type SiteTakedownResult,
  type TenantSite,
} from "@/lib/site-takedown-api";
import { requestStepUpToken } from "@/lib/step-up";
import {
  buildSiteTakedownBody,
  validateSiteTakedownForm,
  type SiteTakedownFieldErrors,
  type SiteTakedownFormValues,
} from "./site-takedown-form.config";

export function useSiteTakedownForm(slug: string) {
  const [values, setValues] = useState<SiteTakedownFormValues>({
    reason: "",
    confirmSite: "",
  });
  const [errors, setErrors] = useState<SiteTakedownFieldErrors>({});
  const liveErrors = validateSiteTakedownForm({ values, slug });
  const fieldErrors: SiteTakedownFieldErrors = {
    reason: errors.reason ?? (values.reason.trim() === "" ? undefined : liveErrors.reason),
    confirmSite:
      errors.confirmSite ??
      (values.confirmSite.trim() === "" ? undefined : liveErrors.confirmSite),
  };
  function updateField(name: keyof SiteTakedownFormValues, value: string): void {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }
  return {
    values,
    errors,
    setErrors,
    fieldErrors,
    isReady: Object.keys(liveErrors).length === 0,
    updateField,
  };
}

export function useSiteTakedownSubmit(input: {
  readonly organizationId: string;
  readonly action: SiteTakedownAction;
  readonly site: TenantSite;
  readonly values: SiteTakedownFormValues;
  readonly setErrors: (errors: SiteTakedownFieldErrors) => void;
  readonly onApplied: (result: SiteTakedownResult) => void;
}) {
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConflict, setIsConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    const nextErrors = validateSiteTakedownForm({
      values: input.values,
      slug: input.site.slug,
    });
    input.setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || isConflict) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const stepUpToken = await requestStepUpToken();
      input.onApplied(
        await requestSiteTakedown({
          orgId: input.organizationId,
          siteId: input.site.id,
          action: input.action,
          body: buildSiteTakedownBody({ values: input.values, site: input.site }),
          idempotencyKey,
          stepUpToken,
        })
      );
    } catch (cause) {
      if (
        cause instanceof ConflictError &&
        cause.code === PLATFORM_ERROR_CODE.LIFECYCLE_CONFLICT
      ) {
        setIsConflict(true);
      } else {
        if (cause instanceof AppError && cause.status >= 400 && cause.status < 500) {
          setIdempotencyKey(createIdempotencyKey());
        }
        setError(toMessage(cause));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return { isSubmitting, isConflict, error, submit };
}
