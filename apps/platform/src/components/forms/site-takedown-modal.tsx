"use client";

import { useId } from "react";
import { Alert, Button, Modal } from "@suite/ui";
import type { SiteTakedownAction, SiteTakedownResult, TenantSite } from "@/lib/site-takedown-api";
import { ConfigFormRenderer } from "./config-form-renderer";
import {
  SITE_TAKEDOWN_CONFIG,
  siteTakedownFields,
  type SiteTakedownFieldErrors,
} from "./site-takedown-form.config";
import {
  useSiteTakedownForm,
  useSiteTakedownSubmit,
} from "./site-takedown-state";

interface ModalFooterProps {
  readonly confirmLabel: string;
  readonly pendingLabel: string;
  readonly variant: "destructive" | "default";
  readonly formId: string;
  readonly isReady: boolean;
  readonly isSubmitting: boolean;
  readonly isConflict: boolean;
  readonly onClose: () => void;
  readonly onReload: () => void;
}

function ModalFooter(props: ModalFooterProps) {
  if (props.isConflict) {
    return (
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={props.onClose}>Close</Button>
        <Button onClick={props.onReload}>Reload sites</Button>
      </div>
    );
  }
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" disabled={props.isSubmitting} onClick={props.onClose}>
        Cancel
      </Button>
      <Button
        type="submit"
        form={props.formId}
        variant={props.variant}
        isLoading={props.isSubmitting}
        disabled={!props.isReady}
      >
        {props.isSubmitting ? props.pendingLabel : props.confirmLabel}
      </Button>
    </div>
  );
}

function TakedownFormBody({
  formId,
  fields,
  values,
  errors,
  disabled,
  isConflict,
  error,
  onChange,
  onSubmit,
}: {
  readonly formId: string;
  readonly fields: ReturnType<typeof siteTakedownFields>;
  readonly values: { readonly reason: string; readonly confirmSite: string };
  readonly errors: SiteTakedownFieldErrors;
  readonly disabled: boolean;
  readonly isConflict: boolean;
  readonly error: string | null;
  readonly onChange: (name: "reason" | "confirmSite", value: string) => void;
  readonly onSubmit: () => void;
}) {
  return (
    <form
      id={formId}
      onSubmit={(event) => { event.preventDefault(); onSubmit(); }}
      className="space-y-3"
    >
      {isConflict ? (
        <Alert
          variant="warning"
          title="Status changed - reload"
          message="This site's status changed since you opened it. Reload the sites before trying again."
        />
      ) : null}
      {error !== null ? <Alert variant="error" message={error} /> : null}
      <ConfigFormRenderer
        fields={fields}
        values={values}
        errors={errors}
        disabled={disabled}
        formId={formId}
        onChange={onChange}
      />
    </form>
  );
}

export function SiteTakedownModal({
  organizationId,
  action,
  site,
  onClose,
  onApplied,
  onReload,
}: {
  readonly organizationId: string;
  readonly action: SiteTakedownAction;
  readonly site: TenantSite;
  readonly onClose: () => void;
  readonly onApplied: (result: SiteTakedownResult) => void;
  readonly onReload: () => void;
}) {
  const formId = useId();
  const config = SITE_TAKEDOWN_CONFIG[action];
  const form = useSiteTakedownForm(site.slug);
  const submission = useSiteTakedownSubmit({
    organizationId,
    action,
    site,
    values: form.values,
    setErrors: form.setErrors,
    onApplied,
  });
  return (
    <Modal isOpen onClose={() => { if (!submission.isSubmitting) onClose(); }}
      title={config.dialogTitle}
      description={site.title + " (" + site.slug + ") - " + config.description}
      size="lg"
      footer={
        <ModalFooter
          confirmLabel={config.confirmLabel}
          pendingLabel={config.pendingLabel}
          variant={config.variant}
          formId={formId}
          isReady={form.isReady}
          isSubmitting={submission.isSubmitting}
          isConflict={submission.isConflict}
          onClose={onClose}
          onReload={onReload}
        />
      }
    >
      <TakedownFormBody
        formId={formId}
        fields={siteTakedownFields(site)}
        values={form.values}
        errors={form.fieldErrors}
        disabled={submission.isSubmitting || submission.isConflict}
        isConflict={submission.isConflict}
        error={submission.error}
        onChange={form.updateField}
        onSubmit={() => void submission.submit()}
      />
    </Modal>
  );
}
