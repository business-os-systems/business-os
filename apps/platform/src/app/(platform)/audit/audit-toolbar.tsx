"use client";

import { Button, Input } from "@suite/ui";
import {
  AUDIT_FILTER_FIELDS,
  type AuditFilterDraft,
  type AuditFilterFieldConfig,
  type AuditFilterName,
} from "@/components/audit/audit-filter.config";

interface AuditToolbarProps {
  readonly values: AuditFilterDraft;
  readonly isBusy: boolean;
  readonly onFieldChange: (name: AuditFilterName, value: string) => void;
  readonly onApply: () => void;
  readonly onClear: () => void;
}

function FilterField({
  field,
  value,
  disabled,
  onChange,
}: {
  readonly field: AuditFilterFieldConfig;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (name: AuditFilterName, value: string) => void;
}) {
  const inputId = `audit-filter-${field.name}`;
  const maxLength = field.inputType === "text" ? field.maxLength : undefined;
  return (
    <div className={`flex w-full flex-col gap-1 ${field.widthClass}`}>
      <label
        htmlFor={inputId}
        className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary"
      >
        {field.label}
      </label>
      <Input
        id={inputId}
        type={field.inputType}
        value={value}
        placeholder={field.placeholder}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(event) => onChange(field.name, event.target.value)}
      />
    </div>
  );
}

/** Filter bar for the audit search. One row from lg, stacked below it. */
export function AuditToolbar({
  values,
  isBusy,
  onFieldChange,
  onApply,
  onClear,
}: AuditToolbarProps) {
  return (
    <form
      className="flex flex-col gap-2 lg:flex-row lg:flex-nowrap lg:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        onApply();
      }}
    >
      {AUDIT_FILTER_FIELDS.map((field) => (
        <FilterField
          key={field.name}
          field={field}
          value={values[field.name]}
          disabled={isBusy}
          onChange={onFieldChange}
        />
      ))}
      <div className="flex gap-2 lg:ml-auto">
        <Button type="submit" disabled={isBusy}>
          Apply filters
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isBusy}
          onClick={onClear}
        >
          Clear
        </Button>
      </div>
    </form>
  );
}
