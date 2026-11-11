import React from "react";
import { Alert, Button } from "@suite/ui";
import type { InquiryContact, InquiryStatus } from "./inquiries.contract";
import {
  formatInquiryTimestamp,
  INQUIRY_DETAIL_LABELS,
  INQUIRY_STATUS_ACTIONS,
  INQUIRY_STATUS_PRESENTATION,
  type InquiryStatusAction,
} from "./inquiries.config";

export function DetailRow({ label, value }: { readonly label: string; readonly value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="text-sm text-text">{value}</dd>
    </div>
  );
}

export function InquiryMetaRows({
  siteName,
  status,
  submittedAt,
  retentionExpiresAt,
  timeZone,
}: {
  readonly siteName: string;
  readonly status: InquiryStatus;
  readonly submittedAt: string;
  readonly retentionExpiresAt: string;
  readonly timeZone: string;
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
      <DetailRow label={INQUIRY_DETAIL_LABELS.website} value={siteName} />
      <DetailRow
        label={INQUIRY_DETAIL_LABELS.status}
        value={INQUIRY_STATUS_PRESENTATION[status].label}
      />
      <DetailRow
        label={INQUIRY_DETAIL_LABELS.received}
        value={formatInquiryTimestamp(submittedAt, timeZone)}
      />
      <DetailRow
        label={INQUIRY_DETAIL_LABELS.retention}
        value={formatInquiryTimestamp(retentionExpiresAt, timeZone)}
      />
    </dl>
  );
}

function renderPayloadValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Hidden";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function InquiryPayloadSection({
  payload,
  contactRedacted,
}: {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly contactRedacted: boolean;
}) {
  return (
    <section aria-label="Submitted fields" className="space-y-1">
      <h3 className="text-sm font-semibold text-text">{INQUIRY_DETAIL_LABELS.fields}</h3>
      {contactRedacted ? (
        <p className="text-xs text-text-muted">
          Contact values are hidden until the contact capability is used.
        </p>
      ) : null}
      <dl className="divide-y divide-border rounded-lg border border-border bg-surface-muted/40 px-3">
        {Object.entries(payload).map(([key, value]) => (
          <DetailRow key={key} label={key} value={renderPayloadValue(value)} />
        ))}
      </dl>
    </section>
  );
}

function ContactValues({ contact }: { readonly contact: InquiryContact }) {
  return (
    <dl className="divide-y divide-border rounded-lg border border-border bg-surface-muted/40 px-3">
      <DetailRow label={INQUIRY_DETAIL_LABELS.name} value={contact.name ?? "Not provided"} />
      <DetailRow label={INQUIRY_DETAIL_LABELS.email} value={contact.email ?? "Not provided"} />
      <DetailRow label={INQUIRY_DETAIL_LABELS.phone} value={contact.phone ?? "Not provided"} />
    </dl>
  );
}

export function InquiryContactSection({
  contact,
  canRevealPii,
  isRevealing,
  onReveal,
}: {
  readonly contact: InquiryContact | null;
  readonly canRevealPii: boolean;
  readonly isRevealing: boolean;
  readonly onReveal: () => void;
}) {
  if (contact !== null) {
    return (
      <section aria-label="Contact details" className="space-y-2">
        <h3 className="text-sm font-semibold text-text">{INQUIRY_DETAIL_LABELS.contact}</h3>
        <ContactValues contact={contact} />
      </section>
    );
  }
  if (!canRevealPii) {
    return (
      <Alert
        variant="info"
        title="Contact details are hidden"
        message="Viewing inquiry contact details requires the cms:leads:pii capability. Ask a workspace owner for access."
      />
    );
  }
  return (
    <section aria-label="Contact details" className="space-y-2">
      <h3 className="text-sm font-semibold text-text">{INQUIRY_DETAIL_LABELS.contact}</h3>
      <p className="text-xs text-text-secondary">
        Revealing contact details is recorded in the workspace audit trail.
      </p>
      <Button size="sm" variant="secondary" isLoading={isRevealing} onClick={onReveal}>
        Reveal contact details
      </Button>
    </section>
  );
}

export function InquiryStatusSection({
  status,
  isChangingStatus,
  onChange,
}: {
  readonly status: InquiryStatus;
  readonly isChangingStatus: boolean;
  readonly onChange: (status: InquiryStatusAction["status"]) => void;
}) {
  return (
    <section aria-label="Status actions" className="space-y-2">
      <h3 className="text-sm font-semibold text-text">{INQUIRY_DETAIL_LABELS.statusActions}</h3>
      <InquiryStatusActions
        status={status}
        isChangingStatus={isChangingStatus}
        onChange={onChange}
      />
    </section>
  );
}

export function InquiryStatusActions({
  status,
  isChangingStatus,
  onChange,
}: {
  readonly status: InquiryStatus;
  readonly isChangingStatus: boolean;
  readonly onChange: (status: InquiryStatusAction["status"]) => void;
}) {
  const actions = INQUIRY_STATUS_ACTIONS[status];
  if (actions.length === 0) {
    return <p className="text-xs text-text-muted">This inquiry is in a final state.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action.status}
          size="sm"
          variant={action.variant}
          isLoading={isChangingStatus}
          onClick={() => onChange(action.status)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
