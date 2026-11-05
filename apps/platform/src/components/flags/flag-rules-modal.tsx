"use client";

import { useState } from "react";
import { Alert, Button, Modal } from "@suite/ui";
import {
  isFlagEnvironment,
  isFlagRuleType,
  updateFlag,
  type FlagRecord,
  type FlagRuleBody,
} from "@/lib/flags-api";
import { FlagRuleAddForm } from "./flag-rule-add-form";
import { FlagRuleRow, type EditableFlagRule } from "./flag-rule-row";
import { useFlagMutation } from "./use-flag-mutation";

interface FlagRulesModalProps {
  readonly flag: FlagRecord;
  readonly onClose: () => void;
  readonly onSaved: (flag: FlagRecord) => void;
}

export function FlagRulesModal({ flag, onClose, onSaved }: FlagRulesModalProps) {
  const [rules, setRules] = useState<EditableFlagRule[]>(
    flag.rules.map((rule) => ({
      ruleType: rule.ruleType,
      targetId: rule.targetId,
      enabled: rule.enabled,
      priority: rule.priority,
    }))
  );
  const mutation = useFlagMutation();

  function addRule(rule: FlagRuleBody): boolean {
    const duplicate = rules.some(
      (entry) =>
        entry.ruleType === rule.ruleType && entry.targetId === rule.targetId
    );
    if (duplicate) {
      mutation.setError(
        "That target already has a rule. Remove it first or edit the value."
      );
      return false;
    }
    setRules((current) => [...current, rule]);
    mutation.setError(null);
    return true;
  }

  function removeRule(index: number): void {
    setRules((current) => current.filter((_rule, position) => position !== index));
  }

  async function save(): Promise<void> {
    const environment = flag.environment;
    if (!isFlagEnvironment(environment)) {
      mutation.setError("The flag environment is not recognised. Reload the flag.");
      return;
    }
    const nextRules: FlagRuleBody[] = [];
    for (const rule of rules) {
      if (!isFlagRuleType(rule.ruleType)) {
        mutation.setError("A stored rule has an unknown type. Reload the flag.");
        return;
      }
      nextRules.push({
        ruleType: rule.ruleType,
        targetId: rule.targetId,
        enabled: rule.enabled,
        priority: rule.priority,
      });
    }
    await mutation.run(
      (idempotencyKey) =>
        updateFlag({
          key: flag.key,
          environment,
          body: {
            expectedVersion: flag.version,
            rules: nextRules,
            reason: "Update flag targeting",
          },
          idempotencyKey,
        }),
      onSaved
    );
  }

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!mutation.isSaving) onClose();
      }}
      title={`Targeting — ${flag.key}`}
      description="Targeting rules decide the flag value for a tenant or an environment. Higher priority wins; with no rules the flag follows its default state."
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={mutation.isSaving} onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={mutation.isSaving} disabled={mutation.isSaving} onClick={() => void save()}>
            Save rules
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {mutation.error !== null ? (
          <Alert variant="error" message={mutation.error} />
        ) : null}

        <div className="space-y-2">
          {rules.length === 0 ? (
            <p className="text-sm text-text-secondary">
              Global: no targeting rules. The flag follows its default state.
            </p>
          ) : (
            rules.map((rule, index) => (
              <FlagRuleRow
                key={`${rule.ruleType}-${rule.targetId}-${index}`}
                rule={rule}
                disabled={mutation.isSaving}
                onRemove={() => removeRule(index)}
              />
            ))
          )}
        </div>

        <FlagRuleAddForm disabled={mutation.isSaving} onAdd={addRule} />
      </div>
    </Modal>
  );
}
