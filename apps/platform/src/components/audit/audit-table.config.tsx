import type { TableColumnConfig, TableConfig } from "@suite/ui";
import type { AuditPayload, AuditRecord } from "@/lib/audit-api";
import { formatDateTime } from "@/lib/format";

/**
 * Typed table schema for the Platform audit page. Presentation lives here so the
 * screen never hand-writes headers or cells (AGENTS 5, config-based UI primacy).
 */

export type AuditPayloadAccess = "granted" | "restricted";

export interface AuditTableOptions {
  readonly payloadAccess: AuditPayloadAccess;
}

const RESTRICTED_PAYLOAD_REASON =
  "Payload requires the Read personal data capability.";

export interface AuditPayloadEntry {
  readonly path: string;
  readonly value: string;
}

export interface AuditPayloadSummary {
  readonly entries: readonly AuditPayloadEntry[];
  readonly hiddenCount: number;
}

const MAX_PAYLOAD_DEPTH = 2;
const MAX_PAYLOAD_ENTRIES = 6;
const MAX_PAYLOAD_VALUE_LENGTH = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describePayloadValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "object") {
    return JSON.stringify(value).slice(0, MAX_PAYLOAD_VALUE_LENGTH);
  }
  if (typeof value === "string") {
    return value.slice(0, MAX_PAYLOAD_VALUE_LENGTH);
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value).slice(0, MAX_PAYLOAD_VALUE_LENGTH);
  }
  return "";
}

function collectPayloadEntries(
  payload: Record<string, unknown>,
  prefix: string,
  depth: number,
  entries: AuditPayloadEntry[],
): void {
  for (const [key, value] of Object.entries(payload)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (isRecord(value) && depth < MAX_PAYLOAD_DEPTH) {
      collectPayloadEntries(value, path, depth + 1, entries);
      continue;
    }
    entries.push({ path, value: describePayloadValue(value) });
  }
}

/** A compact key/value view of a redacted before/after payload, never raw JSON. */
function describeAuditPayload(
  payload: AuditPayload,
): AuditPayloadSummary {
  if (payload === null) {
    return { entries: [], hiddenCount: 0 };
  }
  const entries: AuditPayloadEntry[] = [];
  collectPayloadEntries(payload, "", 0, entries);
  return {
    entries: entries.slice(0, MAX_PAYLOAD_ENTRIES),
    hiddenCount: Math.max(0, entries.length - MAX_PAYLOAD_ENTRIES),
  };
}

function occurredColumn(): TableColumnConfig<AuditRecord> {
  return {
    key: "occurredAt",
    header: "Occurred (UTC)",
    width: "13%",
    render: (value) => (
      <span className="text-xs text-text-secondary">
        {formatDateTime(String(value))}
      </span>
    ),
  };
}

function actionColumn(): TableColumnConfig<AuditRecord> {
  return {
    key: "action",
    header: "Action",
    width: "15%",
    render: (_value, row) => (
      <span className="text-xs font-semibold text-text">{row.action}</span>
    ),
  };
}

function actorLabel(value: string | null): string {
  return value === null || value.trim() === "" ? "System" : value;
}

function organizationLabel(value: string | null): string {
  return value === null || value.trim() === "" ? "Platform-wide" : value;
}

function actorColumn(): TableColumnConfig<AuditRecord> {
  return {
    key: "actorOperatorId",
    header: "Actor",
    width: "10%",
    render: (_value, row) => (
      <span className="font-mono text-xs text-text-secondary">
        {actorLabel(row.actorOperatorId)}
      </span>
    ),
  };
}

function entityColumn(): TableColumnConfig<AuditRecord> {
  return {
    key: "entityId",
    header: "Entity",
    width: "13%",
    render: (_value, row) => (
      <span className="flex flex-col">
        <span className="text-xs text-text">{row.entityType}</span>
        <span className="truncate font-mono text-[11px] text-text-muted" title={row.entityId}>
          {row.entityId}
        </span>
      </span>
    ),
  };
}

function organizationColumn(): TableColumnConfig<AuditRecord> {
  return {
    key: "organizationId",
    header: "Organization",
    width: "12%",
    render: (_value, row) => (
      <span className="font-mono text-xs text-text-secondary">
        {organizationLabel(row.organizationId)}
      </span>
    ),
  };
}

function requestColumn(): TableColumnConfig<AuditRecord> {
  return {
    key: "requestId",
    header: "Request ID",
    width: "10%",
    render: (_value, row) => (
      <span
        className="font-mono text-[11px] text-text-muted"
        title={row.requestId}
      >
        {row.requestId.slice(0, 12)}
      </span>
    ),
  };
}

function integrityColumn(): TableColumnConfig<AuditRecord> {
  return {
    key: "recordHash",
    header: "Integrity",
    width: "8%",
    render: (_value, row) => (
      <span
        className="text-xs font-semibold text-text-secondary"
        title={`Recorded hash ${row.recordHash}`}
      >
        Hashed
      </span>
    ),
  };
}

function PayloadList({
  label,
  summary,
}: {
  readonly label: string;
  readonly summary: AuditPayloadSummary;
}) {
  if (summary.entries.length === 0) {
    return null;
  }
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <dl className="space-y-0.5">
        {summary.entries.map((entry) => (
          <div key={entry.path} className="flex gap-1 text-[11px]">
            <dt className="shrink-0 text-text-muted">{entry.path}</dt>
            <dd className="truncate text-text" title={entry.value}>
              {entry.value}
            </dd>
          </div>
        ))}
      </dl>
      {summary.hiddenCount === 0 ? null : (
        <p className="text-[10px] text-text-muted">
          +{summary.hiddenCount} more fields
        </p>
      )}
    </div>
  );
}

function PayloadCell({ record }: { readonly record: AuditRecord }) {
  const before = describeAuditPayload(record.before);
  const after = describeAuditPayload(record.after);
  if (before.entries.length === 0 && after.entries.length === 0) {
    return <span className="text-xs text-text-muted">No payload</span>;
  }
  return (
    <div className="space-y-1">
      <PayloadList label="Before" summary={before} />
      <PayloadList label="After" summary={after} />
    </div>
  );
}

function RestrictedPayloadCell() {
  return (
    <span
      className="text-xs font-semibold text-text-secondary"
      title={RESTRICTED_PAYLOAD_REASON}
      aria-label={`Restricted: ${RESTRICTED_PAYLOAD_REASON}`}
    >
      Restricted
    </span>
  );
}

function payloadColumn(
  access: AuditPayloadAccess,
): TableColumnConfig<AuditRecord> {
  return {
    key: "before",
    header: "Payload",
    width: "19%",
    render: (_value, row) =>
      access === "granted" ? (
        <PayloadCell record={row} />
      ) : (
        <RestrictedPayloadCell />
      ),
  };
}

export const AUDIT_EMPTY_STATE = {
  title: "No audit events yet",
  description:
    "The tamper-evident chain has no event for this query. Widen the time range or clear the filters.",
} as const;

export const AUDIT_FILTERED_EMPTY_STATE = {
  title: "No audit event matches this filter",
  description: "Clear the filters or widen the time range.",
} as const;

export function createAuditTableConfig({
  payloadAccess,
}: AuditTableOptions): TableConfig<AuditRecord> {
  return {
    id: "platform-audit-table",
    emptyState: AUDIT_EMPTY_STATE,
    columns: [
      occurredColumn(),
      actionColumn(),
      actorColumn(),
      entityColumn(),
      organizationColumn(),
      requestColumn(),
      integrityColumn(),
      payloadColumn(payloadAccess),
    ],
  };
}
