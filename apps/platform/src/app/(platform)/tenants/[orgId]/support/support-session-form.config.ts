import type { ConfigFormField } from "@/components/forms/config-form.types";

export interface SupportSessionFormValues {
  readonly reason: string;
  readonly ticketRef: string;
  readonly targetUserId: string;
}

export const EMPTY_SUPPORT_SESSION_FORM: SupportSessionFormValues = {
  reason: "",
  ticketRef: "",
  targetUserId: "",
};

export const SUPPORT_SESSION_REASON_MIN_LENGTH = 5;
export const SUPPORT_SESSION_REASON_MAX_LENGTH = 255;
export const SUPPORT_SESSION_TICKET_MAX_LENGTH = 100;
export const SUPPORT_SESSION_TARGET_MAX_LENGTH = 191;

export const SUPPORT_SESSION_FIELDS: readonly ConfigFormField<SupportSessionFormValues>[] =
  [
    {
      name: "reason",
      label: "Reason",
      type: "textarea",
      required: true,
      maxLength: SUPPORT_SESSION_REASON_MAX_LENGTH,
      rows: 2,
      colSpan: 2,
      placeholder: "What are you investigating?",
      description: `Recorded in the audit trail (${SUPPORT_SESSION_REASON_MIN_LENGTH}-${SUPPORT_SESSION_REASON_MAX_LENGTH} characters).`,
    },
    {
      name: "ticketRef",
      label: "Support ticket",
      type: "text",
      required: true,
      maxLength: SUPPORT_SESSION_TICKET_MAX_LENGTH,
      placeholder: "e.g. SUP-237",
      description: "The ticket this session serves.",
    },
    {
      name: "targetUserId",
      label: "Target user (optional)",
      type: "text",
      maxLength: SUPPORT_SESSION_TARGET_MAX_LENGTH,
      placeholder: "Leave empty for the whole workspace",
      description: "Narrows the session to one member when the case requires it.",
    },
  ];

export const SUPPORT_SESSION_COPY = {
  pageTitle: "Support sessions",
  pageDescription:
    "Start a read-only, time-boxed session that the workspace can see and end at any time.",
  start: "Start support session",
  starting: "Starting session...",
  emptyTitle: "No active support session",
  emptyDescription:
    "Starting a session records a reason and a ticket, caps it at thirty minutes, and shows a non-dismissible banner to the workspace.",
  readOnly:
    "Support sessions are read-only. Every create, update, delete and publish call is refused for the session's lifetime.",
  end: "End session",
  ending: "Ending session...",
} as const;

function validateReason(reason: string): string | undefined {
  const trimmed = reason.trim();
  if (trimmed.length < SUPPORT_SESSION_REASON_MIN_LENGTH) {
    return `Give a reason of at least ${SUPPORT_SESSION_REASON_MIN_LENGTH} characters.`;
  }
  if (trimmed.length > SUPPORT_SESSION_REASON_MAX_LENGTH) {
    return `Use at most ${SUPPORT_SESSION_REASON_MAX_LENGTH} characters.`;
  }
  return undefined;
}

function validateTicketRef(ticketRef: string): string | undefined {
  const trimmed = ticketRef.trim();
  if (trimmed === "") {
    return "A support-ticket reference is required.";
  }
  if (trimmed.length > SUPPORT_SESSION_TICKET_MAX_LENGTH) {
    return `Use at most ${SUPPORT_SESSION_TICKET_MAX_LENGTH} characters.`;
  }
  return undefined;
}

export function validateSupportSessionForm(
  values: SupportSessionFormValues,
): Partial<Record<keyof SupportSessionFormValues, string>> {
  const errors: Partial<Record<keyof SupportSessionFormValues, string>> = {};
  const reasonError = validateReason(values.reason);
  if (reasonError !== undefined) {
    errors.reason = reasonError;
  }
  const ticketError = validateTicketRef(values.ticketRef);
  if (ticketError !== undefined) {
    errors.ticketRef = ticketError;
  }
  if (values.targetUserId.trim().length > SUPPORT_SESSION_TARGET_MAX_LENGTH) {
    errors.targetUserId = `Use at most ${SUPPORT_SESSION_TARGET_MAX_LENGTH} characters.`;
  }
  return errors;
}

export interface StartSupportSessionBody {
  readonly organizationId: string;
  readonly reason: string;
  readonly ticketRef: string;
  readonly targetUserId?: string;
}

export function buildStartSupportSessionBody(
  organizationId: string,
  values: SupportSessionFormValues,
): StartSupportSessionBody {
  const targetUserId = values.targetUserId.trim();
  return {
    organizationId,
    reason: values.reason.trim(),
    ticketRef: values.ticketRef.trim(),
    ...(targetUserId === "" ? {} : { targetUserId }),
  };
}
