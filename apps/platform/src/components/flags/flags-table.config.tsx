import { Button, cn, type TableConfig } from "@suite/ui";
import { formatDateTime } from "@/lib/format";
import {
  FLAG_RULE_TYPES,
  formatFlagEnvironment,
  type FlagRecord,
} from "@/lib/flags-api";

/**
 * Typed table schema for the Platform flags tab. Presentation lives here so the
 * screen never hand-writes headers or cells (AGENTS 5, config-based UI primacy).
 */

export interface FlagTableActions {
  readonly onToggle: (flag: FlagRecord) => void;
  readonly onRules: (flag: FlagRecord) => void;
  readonly onEdit: (flag: FlagRecord) => void;
}

/**
 * Table status is plain text. Do not wrap it in a Badge or any pill: a table
 * cell must not add a background, border or radius. New statuses extend this
 * function instead of introducing a chip component.
 */
function stateText(flag: FlagRecord) {
  if (flag.isExpired) {
    return { label: "Expired", className: "text-danger" };
  }
  if (flag.isEnabled && flag.defaultEnabled) {
    return { label: "On", className: "text-success" };
  }
  if (flag.isEnabled && flag.rules.length > 0) {
    return { label: "Targeted", className: "text-brand" };
  }
  if (flag.isEnabled) {
    return { label: "Master on", className: "text-warning" };
  }
  return { label: "Off", className: "text-text-secondary" };
}

export function describeFlagRules(flag: FlagRecord): string {
  if (flag.rules.length === 0) {
    return "Global";
  }
  const tenantRules = flag.rules.filter(
    (rule) => rule.ruleType === FLAG_RULE_TYPES[0]
  ).length;
  const environmentRules = flag.rules.length - tenantRules;
  const parts: string[] = [];
  if (tenantRules > 0) {
    parts.push(`${tenantRules} tenant`);
  }
  if (environmentRules > 0) {
    parts.push(`${environmentRules} environment`);
  }
  return parts.join(" + ");
}

export function createFlagsTableConfig(
  actions: FlagTableActions
): TableConfig<FlagRecord> {
  return {
    id: "platform-flags-table",
    emptyState: {
      title: "No feature flags yet",
      description:
        "Create the first flag to gate an app feature. Flags start off and expire automatically.",
    },
    columns: [
      {
        key: "key",
        header: "Flag",
        width: "23%",
        render: (_value, row) => (
          <div className="flex flex-col">
            <span className="font-mono text-xs font-medium text-text">{row.key}</span>
            <span className="text-xs text-text-muted">{row.name}</span>
          </div>
        ),
      },
      {
        key: "environment",
        header: "Environment",
        width: "9%",
        render: (value) => (
          <span className="text-xs font-semibold text-text">
            {formatFlagEnvironment(String(value))}
          </span>
        ),
      },
      {
        key: "isEnabled",
        header: "State",
        width: "11%",
        render: (_value, row) => {
          const status = stateText(row);
          return (
            <span
              className={cn(
                "whitespace-nowrap text-xs font-semibold",
                status.className
              )}
            >
              {status.label}
            </span>
          );
        },
      },
      {
        key: "owner",
        header: "Owner",
        width: "16%",
        render: (value) => (
          <span className="text-xs text-text-secondary">
            {value === null || value === "" ? "Unassigned" : String(value)}
          </span>
        ),
      },
      {
        key: "expiresAt",
        header: "Expires",
        width: "12%",
        render: (_value, row) => {
          if (row.isExpired) {
            return <span className="text-xs font-medium text-danger">Expired</span>;
          }
          return (
            <span className="text-xs text-text-secondary">
              {row.expiresAt === null ? "No expiry" : formatDateTime(row.expiresAt)}
            </span>
          );
        },
      },
      {
        key: "rules",
        header: "Targeting",
        width: "9%",
        render: (_value, row) => (
          <span className="text-xs text-text-secondary">{describeFlagRules(row)}</span>
        ),
      },
      {
        key: "id",
        header: "Actions",
        align: "right",
        width: "20%",
        render: (_value, row) => (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={row.isExpired}
              onClick={() => actions.onToggle(row)}
            >
              {row.isEnabled ? "Disable" : "Enable"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => actions.onEdit(row)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => actions.onRules(row)}>
              Rules
            </Button>
          </div>
        ),
      },
    ],
  };
}

export const FLAG_FILTERED_EMPTY_STATE = {
  title: "No flag in this environment",
  description: "Clear the environment filter or create a flag here.",
} as const;
