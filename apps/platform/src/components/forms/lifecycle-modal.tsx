"use client";

import { useId, useState } from "react";
import { Alert, Button, Modal } from "@suite/ui";
import { AppError, ConflictError } from "@suite/core/errors";
import { PLATFORM_ERROR_CODE, type TenantLifecycleAction } from "@suite/core";
import { createIdempotencyKey } from "@/lib/api";
import { toMessage } from "@/lib/error-message";
import { requestTenantLifecycle, type TenantLifecycleResult } from "@/lib/tenant-api";
import { ConfigFormRenderer } from "./config-form-renderer";
import {
  LIFECYCLE_ACTION_CONFIG, LIFECYCLE_CONFLICT_MESSAGE, LIFECYCLE_CONFLICT_TITLE,
  buildLifecycleBody, lifecycleFormFields,
  validateLifecycleForm, type LifecycleFieldErrors, type LifecycleFormValues,
  type LifecycleTenant,
} from "./lifecycle-form.config";

export function LifecycleModal({
  action, tenant, onClose, onApplied, onReload,
}: {
  readonly action: TenantLifecycleAction; readonly tenant: LifecycleTenant;
  readonly onClose: () => void;
  readonly onApplied: (result: TenantLifecycleResult) => void;
  readonly onReload: () => void;
}) {
  const formId = useId();
  const config = LIFECYCLE_ACTION_CONFIG[action];
  const fields = lifecycleFormFields({ action, slug: tenant.slug });
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [values, setValues] = useState<LifecycleFormValues>({ reason: "", confirmSlug: "" });
  const [errors, setErrors] = useState<LifecycleFieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConflict, setIsConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liveErrors = validateLifecycleForm({ action, values, slug: tenant.slug });
  const isReady = Object.keys(liveErrors).length === 0;
  const fieldErrors: LifecycleFieldErrors = {
    reason: errors.reason ?? (values.reason.trim() === "" ? undefined : liveErrors.reason),
    confirmSlug: errors.confirmSlug ?? (values.confirmSlug.trim() === "" ? undefined : liveErrors.confirmSlug),
  };

  function updateField(name: keyof LifecycleFormValues, value: string): void {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function submit(): Promise<void> {
    const nextErrors = validateLifecycleForm({ action, values, slug: tenant.slug });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || isConflict) return;
    setIsSubmitting(true);
    setError(null);
    try {
      onApplied(await requestTenantLifecycle({
        orgId: tenant.id, action,
        body: buildLifecycleBody({ action, values, expectedStatus: tenant.status }),
        idempotencyKey,
      }));
    } catch (cause) {
      if (cause instanceof ConflictError && cause.code === PLATFORM_ERROR_CODE.LIFECYCLE_CONFLICT) {
        setIsConflict(true);
      } else {
        if (
          cause instanceof AppError &&
          cause.status >= 400 &&
          cause.status < 500
        ) {
          setIdempotencyKey(createIdempotencyKey());
        }
        setError(toMessage(cause));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const footer = isConflict ? (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onClose}>Close</Button>
      <Button onClick={onReload}>Reload record</Button>
    </div>
  ) : (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" disabled={isSubmitting} onClick={onClose}>Cancel</Button>
      <Button type="submit" form={formId} variant={config.variant} isLoading={isSubmitting} disabled={!isReady}>
        {isSubmitting ? config.pendingLabel : config.confirmLabel}
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={() => { if (!isSubmitting) onClose(); }}
      title={config.confirmLabel}
      description={`${tenant.name} (${tenant.slug}) - ${tenant.status}. ${config.description}`}
      size="lg"
      footer={footer}
    >
      <form id={formId} onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-3">
        {isConflict ? <Alert variant="warning" title={LIFECYCLE_CONFLICT_TITLE} message={LIFECYCLE_CONFLICT_MESSAGE} /> : null}
        {error !== null ? <Alert variant="error" message={error} /> : null}
        <ConfigFormRenderer
          fields={fields}
          values={values}
          errors={fieldErrors}
          disabled={isSubmitting || isConflict}
          formId={formId}
          onChange={updateField}
        />
      </form>
    </Modal>
  );
}
