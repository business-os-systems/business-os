"use client";

import { Input, Select, Textarea } from "@suite/ui";
import type { ConfigFormField } from "./config-form.types";

export interface PlainFieldControlProps<T extends object> {
  readonly field: ConfigFormField<T>;
  readonly value: string;
  readonly disabled: boolean;
  readonly inputId: string;
  readonly hasError: boolean;
  readonly describedBy: string | undefined;
  readonly onChange: (next: string) => void;
}

/** Select, long text, date or plain text: the controls that need no registry. */
export function PlainFieldControl<T extends object>(props: PlainFieldControlProps<T>) {
  const { field, onChange } = props;
  if (field.type === "select") {
    return (
      <Select
        id={props.inputId}
        value={props.value}
        options={field.options}
        disabled={props.disabled}
        hasError={props.hasError}
        aria-invalid={props.hasError ? true : undefined}
        aria-describedby={props.describedBy}
        onChange={onChange}
      />
    );
  }
  if (field.type === "textarea") {
    return (
      <Textarea
        id={props.inputId}
        value={props.value}
        disabled={props.disabled}
        maxLength={field.maxLength}
        rows={field.rows}
        placeholder={field.placeholder}
        aria-invalid={props.hasError ? true : undefined}
        aria-describedby={props.describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  const isDate = field.type === "datetime-local";
  const maxLength = field.type === "text" ? field.maxLength : undefined;
  return (
    <Input
      id={props.inputId}
      type={isDate ? "datetime-local" : "text"}
      value={props.value}
      disabled={props.disabled}
      maxLength={maxLength}
      placeholder={field.placeholder}
      aria-invalid={props.hasError ? true : undefined}
      aria-describedby={props.describedBy}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
