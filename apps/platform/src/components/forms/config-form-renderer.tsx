"use client";

import { Checkbox, Input, Label, Select, Textarea } from "@suite/ui";
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

interface FieldRenderProps<T extends object> {
  readonly field: ConfigFormField<T>;
  readonly value: string;
  readonly error: string | undefined;
  readonly disabled: boolean;
  readonly inputId: string;
  readonly errorId: string;
  readonly onChange: (name: keyof T & string, value: string) => void;
}

function describedBy(error: string | undefined, errorId: string): string | undefined {
  return error === undefined ? undefined : errorId;
}

function fieldWrapperClass<T extends object>(field: ConfigFormField<T>): string {
  return field.colSpan === 2 ? "space-y-1.5 sm:col-span-2" : "space-y-1.5";
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

function FieldError({ errorId, error }: { readonly errorId: string; readonly error: string | undefined }) {
  if (error === undefined) {
    return null;
  }
  return (
    <p id={errorId} role="alert" className="text-xs font-medium text-danger">
      {error}
    </p>
  );
}

function CheckboxField<T extends object>({
  field, value, error, disabled, inputId, errorId, onChange,
}: FieldRenderProps<T>) {
  return (
    <div className={fieldWrapperClass(field)}>
      <div className="flex items-start gap-2">
        <Checkbox
          id={inputId}
          checked={value === "true"}
          disabled={disabled}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={describedBy(error, errorId)}
          onChange={(event) => onChange(field.name, event.target.checked ? "true" : "false")}
        />
        <div className="space-y-0.5">
          <Label htmlFor={inputId} className="text-xs font-medium text-text">
            {field.label}
            {field.required ? <span className="ml-0.5 text-danger">*</span> : null}
          </Label>
          {field.description === undefined ? null : (
            <p className="text-[11px] text-text-muted">{field.description}</p>
          )}
        </div>
      </div>
      <FieldError errorId={errorId} error={error} />
    </div>
  );
}

function FieldControl<T extends object>({
  field, value, error, disabled, inputId, errorId, onChange,
}: FieldRenderProps<T>) {
  if (field.type === "checkbox") {
    return null;
  }
  if (field.type === "select") {
    return (
      <Select
        id={inputId}
        value={value}
        options={field.options}
        disabled={disabled}
        hasError={error !== undefined}
        aria-describedby={describedBy(error, errorId)}
        aria-invalid={error === undefined ? undefined : true}
        onChange={(next) => onChange(field.name, next)}
      />
    );
  }
  if (field.type === "textarea") {
    return (
      <Textarea
        id={inputId}
        value={value}
        disabled={disabled}
        maxLength={field.maxLength}
        rows={field.rows}
        placeholder={field.placeholder}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy(error, errorId)}
        onChange={(event) => onChange(field.name, event.target.value)}
      />
    );
  }
  return (
    <Input
      id={inputId}
      type={field.type === "datetime-local" ? "datetime-local" : "text"}
      value={value}
      disabled={disabled}
      maxLength={field.type === "text" ? field.maxLength : undefined}
      placeholder={field.placeholder}
      aria-invalid={error === undefined ? undefined : true}
      aria-describedby={describedBy(error, errorId)}
      onChange={(event) => onChange(field.name, event.target.value)}
    />
  );
}

function StandardField<T extends object>({
  field, value, error, disabled, inputId, errorId, onChange,
}: FieldRenderProps<T>) {
  return (
    <div className={fieldWrapperClass(field)}>
      <Label htmlFor={inputId} className="text-xs font-medium text-text">
        <FieldLabel field={field} />
        {field.required ? <span className="ml-0.5 text-danger">*</span> : null}
      </Label>
      <FieldControl
        field={field}
        value={value}
        error={error}
        disabled={disabled}
        inputId={inputId}
        errorId={errorId}
        onChange={onChange}
      />
      {field.description !== undefined && error === undefined ? (
        <p className="text-[11px] text-text-muted">{field.description}</p>
      ) : null}
      <FieldError errorId={errorId} error={error} />
    </div>
  );
}

/** Renders a typed field schema through the shared design primitives. */
export function ConfigFormRenderer<T extends object>({
  fields, values, errors, disabled, formId, onChange,
}: ConfigFormRendererProps<T>) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {fields.map((field) => {
        const inputId = `${formId}-${field.name}`;
        const errorId = `${inputId}-error`;
        const fieldProps: FieldRenderProps<T> = {
          field,
          value: values[field.name],
          error: errors[field.name],
          disabled,
          inputId,
          errorId,
          onChange,
        };
        return field.type === "checkbox" ? (
          <CheckboxField key={field.name} {...fieldProps} />
        ) : (
          <StandardField key={field.name} {...fieldProps} />
        );
      })}
    </div>
  );
}
