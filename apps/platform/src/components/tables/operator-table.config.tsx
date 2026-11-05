import { isPlatformCapability } from "@suite/core";
import { cn, type TableConfig } from "@suite/ui";
import { formatDateTime } from "@/lib/format";
import type { OperatorStatus, OperatorSummary } from "@/lib/operators-api";
import {
  OPERATOR_STATUS_PRESENTATION,
  operatorSignIn,
} from "@/components/operators/operator-presentation";

function capabilityCount(capabilities: readonly string[]): string {
  const known = capabilities.filter((code) => isPlatformCapability(code)).length;
  const unregistered = capabilities.length - known;
  if (known === 0 && unregistered === 0) {
    return "None";
  }
  const granted = `${known} granted`;
  return unregistered === 0
    ? granted
    : `${granted} + ${unregistered} unregistered`;
}

function statusCell(status: OperatorStatus) {
  const presentation = OPERATOR_STATUS_PRESENTATION[status];
  return (
    <span
      className={cn(
        "whitespace-nowrap text-xs font-semibold",
        presentation.className,
      )}
    >
      {presentation.label}
    </span>
  );
}

function lastSeenCell(lastSeenAt: string | null) {
  return (
    <span className="text-xs text-text-secondary">
      {lastSeenAt === null ? "Never" : formatDateTime(lastSeenAt)}
    </span>
  );
}

export const OPERATOR_TABLE_CONFIG: TableConfig<OperatorSummary> = {
  id: "platform-operator-table",
  emptyState: {
    title: "No operators yet",
    description:
      "No operator account exists on this control plane. Provision the first operator through the bootstrap path.",
  },
  columns: [
    {
      key: "displayName",
      header: "Operator",
      width: "34%",
      render: (_value, row) => (
        <div className="flex flex-col">
          <span className="font-medium text-text">{row.displayName}</span>
          <span className="text-xs text-text-muted">{row.email}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "14%",
      render: (_value, row) => statusCell(row.status),
    },
    {
      key: "mfaEnrolled",
      header: "Sign-in",
      width: "14%",
      render: (_value, row) => {
        const signIn = operatorSignIn(row.mfaEnrolled);
        return (
          <span className={cn("text-xs", signIn.className)}>
            {signIn.label}
          </span>
        );
      },
    },
    {
      key: "capabilities",
      header: "Capabilities",
      width: "16%",
      render: (_value, row) => (
        <span className="text-xs text-text-secondary">
          {capabilityCount(row.capabilities)}
        </span>
      ),
    },
    {
      key: "lastSeenAt",
      header: "Last seen",
      align: "right",
      width: "22%",
      render: (_value, row) => lastSeenCell(row.lastSeenAt),
    },
  ],
};
