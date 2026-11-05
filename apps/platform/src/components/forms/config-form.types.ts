import type { BaseFormFieldConfig, FormFieldOption } from "@suite/ui";

/**
 * Declarative form-field schema shared by the Platform modals. The variants are
 * discriminated so a select always carries options and a datetime field never
 * pretends to accept free text (AGENTS 5, discriminated unions).
 */

export type ConfigFormOption = FormFieldOption;

type ConfigFormFieldBase<T extends object> = BaseFormFieldConfig<T>;

export interface TextConfigFormField<T extends object>
  extends ConfigFormFieldBase<T> {
  readonly type: "text";
  readonly maxLength?: number;
  readonly highlight?: string;
}

export interface TextareaConfigFormField<T extends object>
  extends ConfigFormFieldBase<T> {
  readonly type: "textarea";
  readonly maxLength?: number;
  readonly rows?: number;
}

export interface SelectConfigFormField<T extends object>
  extends ConfigFormFieldBase<T> {
  readonly type: "select";
  readonly options: readonly ConfigFormOption[];
}

export interface DateTimeConfigFormField<T extends object>
  extends ConfigFormFieldBase<T> {
  readonly type: "datetime-local";
}

export type ConfigFormField<T extends object> =
  | TextConfigFormField<T>
  | TextareaConfigFormField<T>
  | SelectConfigFormField<T>
  | DateTimeConfigFormField<T>;

export type ConfigFormErrors<T extends object> = Partial<
  Record<keyof T & string, string>
>;
