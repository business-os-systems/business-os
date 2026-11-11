"use client";

import React from "react";
import { Alert, Button, Modal, Spinner } from "@suite/ui";
import type { InquiryDetail } from "./inquiries.contract";
import { formatInquiryTimestamp } from "./inquiries.config";
import { useInquiryDetail, type InquiryDetailState } from "./use-inquiry-detail";
import {
  InquiryContactSection,
  InquiryMetaRows,
  InquiryPayloadSection,
  InquiryStatusSection,
} from "./inquiry-detail-sections";

export interface InquiryDetailProps {
  readonly inquiryId: string | null;
  readonly canRevealPii: boolean;
  readonly siteName: string;
  readonly siteTimeZone: string;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}

function DetailBody({
  state,
  inquiry,
  siteName,
  timeZone,
  canRevealPii,
  isRevealing,
  isChangingStatus,
  onReveal,
  onChangeStatus,
}: {
  readonly state: InquiryDetailState;
  readonly inquiry: InquiryDetail | null;
  readonly siteName: string;
  readonly timeZone: string;
  readonly canRevealPii: boolean;
  readonly isRevealing: boolean;
  readonly isChangingStatus: boolean;
  readonly onReveal: () => void;
  readonly onChangeStatus: (status: "READ" | "ARCHIVED" | "SPAM") => void;
}) {
  if (state.kind === "loading") {
    return (
      <div role="status" aria-label="Loading inquiry" className="flex h-40 items-center justify-center">
        <Spinner size="md" className="text-action" />
      </div>
    );
  }
  if (state.kind === "error") {
    return <Alert variant="error" title="Could not load the inquiry" message={state.message} />;
  }
  if (inquiry === null) {
    return <Alert variant="error" title="Inquiry unavailable" message="The inquiry was not returned." />;
  }
  return (
    <div className="space-y-5">
      <InquiryMetaRows
        siteName={siteName}
        status={inquiry.status}
        submittedAt={inquiry.submittedAt}
        retentionExpiresAt={inquiry.retentionExpiresAt}
        timeZone={timeZone}
      />
      <InquiryContactSection
        contact={inquiry.contact}
        canRevealPii={canRevealPii}
        isRevealing={isRevealing}
        onReveal={onReveal}
      />
      <InquiryPayloadSection payload={inquiry.payload} contactRedacted={inquiry.contactRedacted} />
      <InquiryStatusSection
        status={inquiry.status}
        isChangingStatus={isChangingStatus}
        onChange={onChangeStatus}
      />
    </div>
  );
}

export function InquiryDetailDrawer({
  inquiryId,
  canRevealPii,
  siteName,
  siteTimeZone,
  onClose,
  onChanged,
}: InquiryDetailProps) {
  const controller = useInquiryDetail({
    inquiryId,
    onChanged,
    onErased: onClose,
  });
  const inquiry = controller.state.kind === "ready" ? controller.state.inquiry : null;
  const subtitle = inquiry === null ? siteName : siteName + " · " + formatInquiryTimestamp(inquiry.submittedAt, siteTimeZone);
  return (
    <Modal
      isOpen={inquiryId !== null}
      onClose={onClose}
      size="xl"
      title="Inquiry"
      description={subtitle}
      footer={<Button variant="secondary" size="sm" onClick={onClose}>Close</Button>}
    >
      <DetailBody
        state={controller.state}
        inquiry={inquiry}
        siteName={siteName}
        timeZone={siteTimeZone}
        canRevealPii={canRevealPii}
        isRevealing={controller.isRevealing}
        isChangingStatus={controller.isChangingStatus}
        onReveal={() => void controller.reveal()}
        onChangeStatus={(status) => void controller.changeStatus(status)}
      />
    </Modal>
  );
}
