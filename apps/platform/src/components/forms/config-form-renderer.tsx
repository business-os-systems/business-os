"use client";

import { Input, Label, Select, Textarea } from "@suite/ui";
import type {
  ConfigFormErrors,
  ConfigFormField,
} from "./config-form.types";

interface ConfigFormRendererProps<T extends object> {
  readonly fields: readonly ConfigFormField<T>[];
  readonly values: Readonly<Record<keyof T & string, string>>;
  readonly errors: ConfigFormErrors<T>;
  readonly disabled: boolean;
  readonly formId: string;
  readonly onChange: (name: keyof T & string, value: string) => void;
}

function FieldLabel<T extends object>({ field }: { field: ConfigFormField<T> }) {
  if (field.type !== "text" || field.highlight === undefined) {
    return <>{field.label}</>;
  }
  const index = field.label.indexOf(field.highlight);
  if (index === -1) return <>{field.label}</>;
  const before = field.label.slice(0, index);
  const after = field.label.slice(index + field.highlight.length);
  return (
    <>
      {before}
      <strong className="mx-1 rounded bg-brand-tint px-1 font-mono font-semibold text-brand">
        {field.highlight}
      </strong>
      {after}
    </>
  );
}

/** Renders a typed field schema through the shared design primitives. */
export function ConfigFormRenderer<T extends object>({
  fields,
  values,
  errors,
  disabled,
  formId,
  onChange,
}: ConfigFormRendererProps<T>) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {fields.map((field) => {
        const inputId = `${formId}-${field.name}`;
        const errorId = `${inputId}-error`;
        const error = errors[field.name];
        const value = values[field.name];
        const describedBy = error === undefined ? undefined : errorId;

        return (
          <div
            key={field.name}
            className={
              field.colSpan === 2 ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"
            }
          >
            <Label htmlFor={inputId} className="text-xs font-medium text-text">
              <FieldLabel field={field} />
              {field.required ? (
                <span className="ml-0.5 text-danger">*</span>
              ) : null}
            </Label>
            {field.type === "select" ? (
              <Select
                id={inputId}
                value={value}
                options={field.options}
                disabled={disabled}
                hasError={error !== undefined}
                aria-describedby={describedBy}
                aria-invalid={error === undefined ? undefined : true}
                onChange={(next) => onChange(field.name, next)}
              />
            ) : field.type === "textarea" ? (
              <Textarea
                id={inputId}
                value={value}
                disabled={disabled}
                maxLength={field.maxLength}
                rows={field.rows}
                placeholder={field.placeholder}
                aria-invalid={error === undefined ? undefined : true}
                aria-describedby={describedBy}
                onChange={(event) => onChange(field.name, event.target.value)}
              />
            ) : (
              <Input
                id={inputId}
                type={field.type === "datetime-local" ? "datetime-local" : "text"}
                value={value}
                disabled={disabled}
                maxLength={
                  field.type === "text" ? field.maxLength : undefined
                }
                placeholder={field.placeholder}
                aria-invalid={error === undefined ? undefined : true}
                aria-describedby={describedBy}
                onChange={(event) => onChange(field.name, event.target.value)}
              />
            )}
            {field.description !== undefined && error === undefined ? (
              <p className="text-[11px] text-text-muted">{field.description}</p>
            ) : null}
            {error !== undefined ? (
              <p
                id={errorId}
                role="alert"
                className="text-xs font-medium text-danger"
              >
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
