"use client";

import React, { useState, useId, useEffect } from "react";
import type { z } from "zod";
import {
  Input,
  Label,
  Textarea,
  Checkbox,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Select,
  StickyActionBar,
} from "@suite/ui";
import type {
  FormConfig,
  FormFieldConfig,
  FormCardSection,
  FormFieldType,
  StandardFormSection,
  DangerZoneFormSection,
} from "@suite/ui";
import { hasPermission } from "@suite/core";
import { DangerZoneCard } from "../settings/danger-zone-card.js";

export interface ConfigFormRendererProps<T extends object> {
  /**
   * Strongly-typed form presentation configuration schema.
   */
  config: FormConfig<T>;
  /**
   * Initial form values.
   */
  initialValues?: Partial<T>;
  /**
   * Optional Zod validation schema for form-level or field-level validation.
   */
  validationSchema?: z.ZodType<T>;
  /**
   * Explicit user capability permissions for capability-based gating.
   */
  userPermissions?: readonly string[];
  /**
   * In-flight saving state.
   */
  isSaving?: boolean;
  /**
   * Callback invoked upon valid form submission.
   */
  onSubmit: (values: T) => void | Promise<void>;
  /**
   * Callback invoked upon discarding pending changes.
   */
  onDiscard?: () => void;
  /**
   * Callback invoked for dangerous zone actions.
   */
  onDangerAction?: (sectionId: string) => void | Promise<void>;
  /**
   * External server errors (e.g., from RFC 7807 problem details).
   */
  serverErrors?: Record<string, string>;
  /**
   * Optional custom CSS class name for outer wrapper.
   */
  className?: string;
}

const INPUT_TYPE_BY_FIELD = {
  text: "text",
  number: "number",
  password: "password",
  custom: "text",
  switch: "text",
  textarea: "text",
  select: "text",
} as const satisfies Record<FormFieldType, "text" | "number" | "password">;

interface FormState<T extends object> {
  readonly values: T;
  readonly errors: Record<string, string>;
  readonly formError: string | null;
  readonly isDirty: boolean;
  readonly handleFieldChange: (name: keyof T & string, value: unknown) => void;
  readonly handleDiscard: () => void;
  readonly handleSubmit: (event: React.FormEvent) => void;
}

function isAuthorized(
  permission?: string,
  userPermissions?: readonly string[]
): boolean {
  if (!permission) return true;
  if (!userPermissions || userPermissions.length === 0) return false;
  return hasPermission(userPermissions, permission);
}

/**
 * Builds initial values dictionary from section field defaults and initial overrides.
 */
function buildInitialState<T extends object>(
  sections: FormCardSection<T>[],
  initialValues?: Partial<T>
): T {
  const state: Record<string, unknown> = {};
  for (const section of sections) {
    if (section.isDangerZone === true || !section.fields) continue;
    for (const field of section.fields) {
      const key = field.name as string;
      if (initialValues && (initialValues as Record<string, unknown>)[key] !== undefined) {
        state[key] = (initialValues as Record<string, unknown>)[key];
      } else if (field.defaultValue !== undefined) {
        state[key] = field.defaultValue;
      } else if (field.type === "switch") {
        state[key] = false;
      } else if (field.type === "number") {
        state[key] = 0;
      } else {
        state[key] = "";
      }
    }
  }
  return state as T;
}

function validateValues<T extends object>(
  schema: z.ZodType<T>,
  values: T
): Record<string, string> | null {
  const result = schema.safeParse(values);
  if (result.success) {
    return null;
  }
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path[0];
    if (path !== undefined && typeof path === "string") {
      fieldErrors[path] = issue.message;
    }
  }
  return fieldErrors;
}

interface ConfigFormOptions<T extends object> {
  readonly initialValues?: Partial<T>;
  readonly validationSchema?: z.ZodType<T>;
  readonly onSubmit: (values: T) => void | Promise<void>;
  readonly onDiscard?: () => void;
}

function useConfigForm<T extends object>(
  config: FormConfig<T>,
  options: ConfigFormOptions<T>
): FormState<T> {
  const { initialValues, validationSchema, onSubmit, onDiscard } = options;
  const [values, setValues] = useState<T>(() =>
    buildInitialState(config.sections, initialValues)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  useEffect(() => {
    setValues(buildInitialState(config.sections, initialValues));
    setIsDirty(false);
  }, [initialValues, config.sections]);

  const handleFieldChange = (name: keyof T & string, value: unknown) => {
    setValues((previous) => ({ ...previous, [name]: value }));
    setIsDirty(true);
    setFormError(null);
    setErrors((previous) => {
      if (previous[name] === undefined) {
        return previous;
      }
      const next = { ...previous };
      delete next[name];
      return next;
    });
  };

  const handleDiscard = () => {
    setValues(buildInitialState(config.sections, initialValues));
    setErrors({});
    setFormError(null);
    setIsDirty(false);
    onDiscard?.();
  };

  async function submit(current: T): Promise<void> {
    try {
      await Promise.resolve(onSubmit(current));
      setIsDirty(false);
    } catch (error) {
      console.error("[ConfigFormRenderer] Form submission failed:", error);
      setFormError(
        error instanceof Error ? error.message : "Unable to save the form."
      );
    }
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (validationSchema) {
      const fieldErrors = validateValues(validationSchema, values);
      if (fieldErrors !== null) {
        setErrors(fieldErrors);
        return;
      }
    }
    void submit(values);
  };

  return {
    values,
    errors,
    formError,
    isDirty,
    handleFieldChange,
    handleDiscard,
    handleSubmit,
  };
}

interface FormHeaderProps {
  readonly title: string;
  readonly description?: string;
}

function FormHeader({ title, description }: FormHeaderProps) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold tracking-tight text-text">
        {title}
      </h2>
      {description !== undefined && (
        <p className="text-xs text-text-muted">{description}</p>
      )}
    </div>
  );
}

interface FieldItemProps<T extends object> {
  readonly field: FormFieldConfig<T>;
  readonly value: unknown;
  readonly values: T;
  readonly error?: string;
  readonly formPrefix: string;
  readonly onChange: (value: unknown) => void;
}

function FormFieldItem<T extends object>({
  field,
  value,
  values,
  error,
  formPrefix,
  onChange,
}: FieldItemProps<T>) {
  const inputId = `${formPrefix}-${field.name}`;
  const isDisabled =
    typeof field.disabled === "function"
      ? field.disabled(values)
      : Boolean(field.disabled);
  const colSpanClass = field.colSpan === 2 ? "md:col-span-2" : "md:col-span-1";

  return (
    <div className={`space-y-1.5 ${colSpanClass}`}>
      <div className="flex items-center justify-between">
        <Label htmlFor={inputId} className="text-xs font-medium text-text">
          {field.label}
          {field.required === true && (
            <span className="text-danger ml-0.5">*</span>
          )}
        </Label>
      </div>

      <FieldControl
        field={field}
        inputId={inputId}
        value={value}
        isDisabled={isDisabled}
        error={error}
        onChange={onChange}
      />

      {field.description !== undefined && error === undefined && (
        <p className="text-[11px] text-text-muted">{field.description}</p>
      )}

      {error !== undefined && (
        <p role="alert" className="text-xs text-danger font-medium animate-in fade-in">
          {error}
        </p>
      )}
    </div>
  );
}

interface SectionProps<T extends object> {
  readonly section: FormCardSection<T>;
  readonly values: T;
  readonly errors: Record<string, string>;
  readonly serverErrors: Record<string, string>;
  readonly userPermissions?: readonly string[];
  readonly formPrefix: string;
  readonly onFieldChange: (name: keyof T & string, value: unknown) => void;
  readonly onDangerAction?: (sectionId: string) => void | Promise<void>;
}

interface SectionFieldsProps<T extends object>
  extends Omit<SectionProps<T>, "onDangerAction" | "section"> {
  readonly fields: FormFieldConfig<T>[];
}

function SectionFields<T extends object>({
  fields,
  values,
  errors,
  serverErrors,
  userPermissions,
  formPrefix,
  onFieldChange,
}: SectionFieldsProps<T>) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {fields.map((field) => {
        if (!isAuthorized(field.permission, userPermissions)) {
          return null;
        }
        return (
          <FormFieldItem
            key={field.name}
            field={field}
            value={values[field.name]}
            values={values}
            error={errors[field.name] ?? serverErrors[field.name]}
            formPrefix={formPrefix}
            onChange={(value) => onFieldChange(field.name, value)}
          />
        );
      })}
    </div>
  );
}

interface StandardSectionProps<T extends object>
  extends Omit<SectionProps<T>, "section"> {
  readonly section: StandardFormSection<T>;
}

function SectionCard<T extends object>({ section, ...props }: StandardSectionProps<T>) {
  return (
    <Card className="border-border bg-surface">
      <CardHeader className="px-5 py-3.5 sm:px-6 sm:py-4 space-y-0.5">
        <CardTitle className="text-sm sm:text-base font-semibold text-text">
          {section.title}
        </CardTitle>
        {section.description !== undefined && (
          <CardDescription className="text-xs text-text-muted">
            {section.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6 pt-0">
        <SectionFields {...props} fields={section.fields} />
      </CardContent>
    </Card>
  );
}

interface DangerSectionProps<T extends object>
  extends Omit<SectionProps<T>, "section"> {
  readonly section: DangerZoneFormSection<T>;
}

function DangerSection<T extends object>({
  section,
  onDangerAction,
}: DangerSectionProps<T>) {
  return (
    <DangerZoneCard
      title={section.title}
      description={section.description ?? ""}
      actionLabel="Proceed"
      expectedSlug={section.dangerConfirmationSlug}
      onConfirm={() => onDangerAction?.(section.id)}
    />
  );
}

function ConfigFormSection<T extends object>(props: SectionProps<T>) {
  if (!isAuthorized(props.section.permission, props.userPermissions)) {
    return null;
  }
  if (props.section.isDangerZone === true) {
    return <DangerSection {...props} section={props.section} />;
  }
  return <SectionCard {...props} section={props.section} />;
}

interface FieldControlProps<T extends object> {
  readonly field: FormFieldConfig<T>;
  readonly inputId: string;
  readonly value: unknown;
  readonly isDisabled: boolean;
  readonly error?: string;
  readonly onChange: (value: unknown) => void;
}

const ERROR_BORDER_CLASS = "border-danger focus:border-danger focus:ring-danger/20";

function SwitchControl<T extends object>({
  field,
  inputId,
  value,
  isDisabled,
  onChange,
}: FieldControlProps<T>) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <Checkbox
        id={inputId}
        checked={Boolean(value)}
        disabled={isDisabled}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.checked)
        }
      />
      <span className="text-xs text-text-secondary select-none">
        {field.placeholder ?? "Enable"}
      </span>
    </div>
  );
}

function TextareaControl<T extends object>({
  field,
  inputId,
  value,
  isDisabled,
  error,
  onChange,
}: FieldControlProps<T>) {
  return (
    <Textarea
      id={inputId}
      name={field.name}
      value={String(value ?? "")}
      placeholder={field.placeholder}
      disabled={isDisabled}
      onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
        onChange(event.target.value)
      }
      className={error === undefined ? "" : ERROR_BORDER_CLASS}
      rows={3}
    />
  );
}

function SelectControl<T extends object>({
  field,
  inputId,
  value,
  isDisabled,
  error,
  onChange,
}: FieldControlProps<T>) {
  if (field.type !== "select") {
    return null;
  }
  return (
    <Select
      id={inputId}
      name={field.name}
      value={String(value ?? "")}
      options={field.options}
      placeholder={field.placeholder}
      disabled={isDisabled}
      hasError={error !== undefined}
      onChange={(next) => onChange(next)}
    />
  );
}

function InputControl<T extends object>({
  field,
  inputId,
  value,
  isDisabled,
  error,
  onChange,
}: FieldControlProps<T>) {
  return (
    <Input
      id={inputId}
      name={field.name}
      type={INPUT_TYPE_BY_FIELD[field.type]}
      value={String(value ?? "")}
      placeholder={field.placeholder}
      disabled={isDisabled}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
        const next = field.type === "number" ? Number(event.target.value) : event.target.value;
        onChange(next);
      }}
      className={error === undefined ? "" : ERROR_BORDER_CLASS}
    />
  );
}

/**
 * Dispatches control rendering based on FormFieldType.
 */
function FieldControl<T extends object>(props: FieldControlProps<T>) {
  switch (props.field.type) {
    case "switch":
      return <SwitchControl {...props} />;
    case "textarea":
      return <TextareaControl {...props} />;
    case "select":
      return <SelectControl {...props} />;
    case "text":
    case "number":
    case "password":
    case "custom":
      return <InputControl {...props} />;
  }
}

/**
 * ConfigFormRenderer
 *
 * Generic declarative schema-driven form engine.
 * Renders card sections, 2-column responsive input grids, inline validation,
 * capability-based permission checks, and sticky footer controls.
 */
export function ConfigFormRenderer<T extends object>({
  config,
  initialValues,
  validationSchema,
  userPermissions,
  isSaving = false,
  onSubmit,
  onDiscard,
  onDangerAction,
  serverErrors = {},
  className = "",
}: ConfigFormRendererProps<T>) {
  const formPrefix = useId();
  const form = useConfigForm(config, {
    initialValues,
    validationSchema,
    onSubmit,
    onDiscard,
  });

  return (
    <form onSubmit={form.handleSubmit} className={`space-y-8 ${className}`}>
      {(config.title || config.description) && (
        <FormHeader title={config.title} description={config.description} />
      )}

      {form.formError !== null && (
        <p role="alert" className="text-xs font-medium text-danger">
          {form.formError}
        </p>
      )}

      {config.sections.map((section) => (
        <ConfigFormSection
          key={section.id}
          section={section}
          values={form.values}
          errors={form.errors}
          serverErrors={serverErrors}
          userPermissions={userPermissions}
          formPrefix={formPrefix}
          onFieldChange={form.handleFieldChange}
          onDangerAction={onDangerAction}
        />
      ))}

      {config.stickyActionBar && (
        <StickyActionBar
          visible={true}
          isDirty={form.isDirty}
          isSaving={isSaving}
          saveLabel={config.stickyActionBar.saveLabel}
          discardLabel={config.stickyActionBar.discardLabel}
          showDiscard={config.stickyActionBar.showDiscard}
          onDiscard={form.handleDiscard}
        />
      )}
    </form>
  );
}
