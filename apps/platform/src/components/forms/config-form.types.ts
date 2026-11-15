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

/** The chrome every guided control needs, declared once to avoid data clumps. */
export interface FieldControlChrome {
  readonly inputId: string;
  readonly labelId: string;
  readonly disabled: boolean;
  readonly hasError: boolean;
  readonly describedBy: string | undefined;
}

/** A six-digit hex colour chosen with a picker, presets and a visible value. */
export interface ColorConfigFormField<T extends object>
  extends ConfigFormFieldBase<T> {
  readonly type: "color";
  readonly presets: readonly string[];
}

/** A declared step, with a custom escape that keeps its unit. */
export interface ScaleConfigFormField<T extends object>
  extends ConfigFormFieldBase<T> {
  readonly type: "scale";
  readonly steps: readonly string[];
  readonly allowCustom: boolean;
}

/** A searchable multi-value selection bound to a registry. */
export interface MultiSelectConfigFormField<T extends object>
  extends ConfigFormFieldBase<T> {
  readonly type: "multi-select";
  readonly options: readonly ConfigFormOption[];
  readonly searchable: boolean;
}

/** A single boolean rendered as a checkbox; the string value is "true"/"false". */
export interface CheckboxConfigFormField<T extends object>
  extends ConfigFormFieldBase<T> {
  readonly type: "checkbox";
}

export type ConfigFormField<T extends object> =
  | TextConfigFormField<T>
  | TextareaConfigFormField<T>
  | SelectConfigFormField<T>
  | DateTimeConfigFormField<T>
  | CheckboxConfigFormField<T>
  | ColorConfigFormField<T>
  | ScaleConfigFormField<T>
  | MultiSelectConfigFormField<T>;

export type ConfigFormErrors<T extends object> = Partial<
  Record<keyof T & string, string>
>;
