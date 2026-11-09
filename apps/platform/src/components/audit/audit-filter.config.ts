import {
  AUDIT_ACTION_MAX_LENGTH,
  AUDIT_IDENTIFIER_MAX_LENGTH,
  type AuditFilters,
} from "@/lib/audit-api";

/**
 * Declarative audit filter schema. The toolbar renders this list, so a label or
 * control never lives in JSX (AGENTS 5, config-based UI primacy).
 */

export type AuditFilterName =
  | "organizationId"
  | "actorOperatorId"
  | "action"
  | "from"
  | "to";

export interface AuditFilterDraft {
  readonly organizationId: string;
  readonly actorOperatorId: string;
  readonly action: string;
  readonly from: string;
  readonly to: string;
}

interface AuditFilterFieldBase {
  readonly name: AuditFilterName;
  readonly label: string;
  readonly placeholder: string;
  readonly widthClass: string;
}

interface AuditTextFilterFieldConfig extends AuditFilterFieldBase {
  readonly inputType: "text";
  readonly maxLength: number;
}

interface AuditInstantFilterFieldConfig extends AuditFilterFieldBase {
  readonly inputType: "datetime-local";
}

export type AuditFilterFieldConfig =
  | AuditTextFilterFieldConfig
  | AuditInstantFilterFieldConfig;

export const AUDIT_FILTER_FIELDS: readonly AuditFilterFieldConfig[] = [
  {
    name: "organizationId",
    label: "Organization",
    placeholder: "org_...",
    inputType: "text",
    widthClass: "lg:w-32",
    maxLength: AUDIT_IDENTIFIER_MAX_LENGTH,
  },
  {
    name: "actorOperatorId",
    label: "Actor operator",
    placeholder: "op_...",
    inputType: "text",
    widthClass: "lg:w-32",
    maxLength: AUDIT_IDENTIFIER_MAX_LENGTH,
  },
  {
    name: "action",
    label: "Action",
    placeholder: "TENANT_SUSPENDED",
    inputType: "text",
    widthClass: "lg:w-32",
    maxLength: AUDIT_ACTION_MAX_LENGTH,
  },
  {
    name: "from",
    label: "From (UTC)",
    placeholder: "",
    inputType: "datetime-local",
    widthClass: "lg:w-36",
  },
  {
    name: "to",
    label: "To (UTC)",
    placeholder: "",
    inputType: "datetime-local",
    widthClass: "lg:w-36",
  },
];

export const EMPTY_AUDIT_FILTER_DRAFT: AuditFilterDraft = {
  organizationId: "",
  actorOperatorId: "",
  action: "",
  from: "",
  to: "",
};

function toIsoInstant(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  // A datetime-local value carries no zone. The field is labelled UTC, so it is
  // parsed as UTC rather than as the browser's local time (CT-8). The guard
  // keeps a malformed programmatic value from throwing in the click handler.
  const date = new Date(`${trimmed}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Converts the toolbar draft into the validated API filter object. */
export function toAuditFilters(draft: AuditFilterDraft): AuditFilters {
  const filters: AuditFilters = {};
  const organizationId = draft.organizationId.trim();
  if (organizationId !== "") {
    filters.organizationId = organizationId;
  }
  const actorOperatorId = draft.actorOperatorId.trim();
  if (actorOperatorId !== "") {
    filters.actorOperatorId = actorOperatorId;
  }
  const action = draft.action.trim();
  if (action !== "") {
    filters.action = action;
  }
  const from = toIsoInstant(draft.from);
  if (from !== undefined) {
    filters.from = from;
  }
  const to = toIsoInstant(draft.to);
  if (to !== undefined) {
    filters.to = to;
  }
  return filters;
}
