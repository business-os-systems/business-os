"use client";

import { Input, Label, Textarea } from "@suite/ui";
import type { LifecycleFieldConfig, LifecycleFieldErrors, LifecycleFormValues } from "./lifecycle-form.config";

interface ConfigFormRendererProps {
  readonly fields: readonly LifecycleFieldConfig[];
  readonly values: LifecycleFormValues;
  readonly errors: LifecycleFieldErrors;
  readonly disabled: boolean;
  readonly formId: string;
  readonly onChange: (name: keyof LifecycleFormValues, value: string) => void;
}

function FieldLabel({ field }: { field: LifecycleFieldConfig }) {
  if (field.type !== "text") return <>{field.label}</>;
  const index = field.label.indexOf(field.highlight);
  if (index === -1) return <>{field.label}</>;
  const before = field.label.slice(0, index);
  const after = field.label.slice(index + field.highlight.length);
  return (
    <>
      {before}
      <strong className="mx-1 rounded bg-brand-tint px-1 font-mono font-semibold text-brand">{field.highlight}</strong>
      {after}
    </>
  );
}

/** Renders the lifecycle field schema through the shared design primitives. */
export function ConfigFormRenderer({ fields, values, errors, disabled, formId, onChange }: ConfigFormRendererProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((field) => {
        const inputId = `${formId}-${field.name}`;
        const errorId = `${inputId}-error`;
        const error = errors[field.name];
        const shared = {
          id: inputId, value: values[field.name], disabled, maxLength: field.maxLength,
          placeholder: field.placeholder,
          "aria-invalid": error === undefined ? undefined : true,
          "aria-describedby": error === undefined ? undefined : errorId,
          onChange: (event: { target: { value: string } }) => onChange(field.name, event.target.value),
        };
        return (
          <div key={field.name} className={field.colSpan === 2 ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
            <Label htmlFor={inputId} className="text-xs font-medium text-text">
              <FieldLabel field={field} />
              {field.required ? <span className="ml-0.5 text-danger">*</span> : null}
            </Label>
            {field.type === "textarea" ? <Textarea {...shared} /> : <Input {...shared} />}
            {field.description !== undefined && error === undefined ? (
              <p className="text-[11px] text-text-muted">{field.description}</p>
            ) : null}
            {error !== undefined ? (
              <p id={errorId} role="alert" className="text-xs font-medium text-danger">{error}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
