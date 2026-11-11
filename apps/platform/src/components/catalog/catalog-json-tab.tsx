"use client";

import { Alert, Button, Textarea } from "@suite/ui";
import type { CatalogIssue } from "@/lib/catalog-schema";

interface CatalogJsonTabProps {
  readonly text: string;
  readonly issues: readonly CatalogIssue[];
  readonly disabled: boolean;
  readonly onChange: (text: string) => void;
  readonly onApply: () => void;
}

/**
 * The raw structured view of the same record. It does not validate on its own:
 * Apply hands the text to the editor, which parses and validates it with the
 * exact schema the generated form saves through (FR-148).
 */
export function CatalogJsonTab({
  text,
  issues,
  disabled,
  onChange,
  onApply,
}: CatalogJsonTabProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">
        Edit the complete catalog record. Properties the kind schema does not declare are
        rejected, and Apply yields the same validated structure as the form.
      </p>
      <Textarea
        aria-label="Catalog record JSON"
        value={text}
        disabled={disabled}
        rows={18}
        className="font-mono text-xs"
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-text-muted">
          {issues.length === 0 ? "No validation errors." : `${issues.length} issue(s) to resolve.`}
        </span>
        <Button type="button" variant="secondary" disabled={disabled} onClick={onApply}>
          Apply JSON
        </Button>
      </div>
      {issues.length === 0 ? null : (
        <Alert
          variant="error"
          title="The JSON does not match the kind schema"
          message={
            <ul className="space-y-1">
              {issues.map((issue) => (
                <li key={`${issue.path}:${issue.message}`}>
                  <span className="font-mono text-xs">{issue.path === "" ? "payload" : issue.path}</span>:{" "}
                  {issue.message}
                </li>
              ))}
            </ul>
          }
        />
      )}
    </div>
  );
}
