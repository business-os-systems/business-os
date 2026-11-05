"use client";

import { Badge, Button } from "@suite/ui";
import { FLAG_RULE_TYPES, formatFlagEnvironment } from "@/lib/flags-api";

export interface EditableFlagRule {
  readonly ruleType: string;
  readonly targetId: string;
  readonly enabled: boolean;
  readonly priority: number;
}

function ruleLabel(ruleType: string): string {
  if (ruleType === FLAG_RULE_TYPES[0]) {
    return "Tenant";
  }
  if (ruleType === FLAG_RULE_TYPES[1]) {
    return "Environment";
  }
  return "Unknown";
}

interface FlagRuleRowProps {
  readonly rule: EditableFlagRule;
  readonly disabled: boolean;
  readonly onRemove: () => void;
}

export function FlagRuleRow({ rule, disabled, onRemove }: FlagRuleRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="secondary">{ruleLabel(rule.ruleType)}</Badge>
        <span className="truncate font-mono text-xs text-text">
          {rule.ruleType === FLAG_RULE_TYPES[1]
            ? formatFlagEnvironment(rule.targetId)
            : rule.targetId}
        </span>
        <span className="text-xs text-text-muted">
          {rule.enabled ? "on" : "off"} · priority {rule.priority}
        </span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={onRemove}
      >
        Remove
      </Button>
    </div>
  );
}
