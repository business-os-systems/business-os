import React, { useState, useId } from "react";
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
} from "@suite/ui";
import type {
  FormConfig,
  FormFieldConfig,
  FormCardSection,
} from "@suite/ui";
import { hasPermission } from "@suite/core";
import { StickyActionBar } from "../settings/sticky-action-bar.js";
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

/**
 * Checks if a section or field is accessible given the user's permissions.
 */
function isAuthorized(permission?: string, userPermissions?: readonly string[]): boolean {
  if (!permission) return true;
  if (!userPermissions) return true;
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
    if (section.isDangerZone || !section.fields) continue;
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
  const [values, setValues] = useState<T>(() => buildInitialState(config.sections, initialValues));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState<boolean>(false);

  const handleFieldChange = (name: keyof T & string, val: unknown) => {
    setValues((prev) => ({ ...prev, [name]: val }));
    setIsDirty(true);
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleDiscard = () => {
    setValues(buildInitialState(config.sections, initialValues));
    setErrors({});
    setIsDirty(false);
    onDiscard?.();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validationSchema) {
      const result = validationSchema.safeParse(values);
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const path = issue.path[0];
          if (path && typeof path === "string") {
            fieldErrors[path] = issue.message;
          }
        }
        setErrors(fieldErrors);
        return;
      }
    }
    await onSubmit(values);
    setIsDirty(false);
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-8 ${className}`}>
      {(config.title || config.description) && (
        <div className="space-y-1">
          {config.title && (
            <h2 className="text-lg font-semibold tracking-tight text-text">
              {config.title}
            </h2>
          )}
          {config.description && (
            <p className="text-xs text-text-muted">{config.description}</p>
          )}
        </div>
      )}

      {config.sections.map((section) => {
        if (!isAuthorized(section.permission, userPermissions)) {
          return null;
        }

        if (section.isDangerZone) {
          return (
            <DangerZoneCard
              key={section.id}
              title={section.title}
              description={section.description ?? ""}
              actionLabel="Proceed"
              expectedSlug={section.dangerConfirmationSlug}
              onConfirm={() => onDangerAction?.(section.id)}
            />
          );
        }

        return (
          <Card key={section.id} className="border-border bg-surface">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-text">
                {section.title}
              </CardTitle>
              {section.description && (
                <CardDescription className="text-xs text-text-muted">
                  {section.description}
                </CardDescription>
              )}
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {section.fields.map((field) => {
                  if (!isAuthorized(field.permission, userPermissions)) {
                    return null;
                  }
                  return (
                    <FormFieldItem
                      key={field.name}
                      field={field}
                      value={values[field.name]}
                      values={values}
                      error={errors[field.name] || serverErrors[field.name]}
                      formPrefix={formPrefix}
                      onChange={(val) => handleFieldChange(field.name, val)}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {config.stickyActionBar && (
        <StickyActionBar
          visible={true}
          isDirty={isDirty}
          isSaving={isSaving}
          saveLabel={config.stickyActionBar.saveLabel}
          discardLabel={config.stickyActionBar.discardLabel}
          showDiscard={config.stickyActionBar.showDiscard}
          onDiscard={handleDiscard}
        />
      )}
    </form>
  );
}

interface FormFieldItemProps<T extends object> {
  field: FormFieldConfig<T>;
  value: unknown;
  values: T;
  error?: string;
  formPrefix: string;
  onChange: (val: unknown) => void;
}

/**
 * Individual field layout item adhering to design tokens and responsive grid span.
 */
function FormFieldItem<T extends object>({
  field,
  value,
  values,
  error,
  formPrefix,
  onChange,
}: FormFieldItemProps<T>) {
  const inputId = `${formPrefix}-${field.name}`;
  const isDisabled =
    typeof field.disabled === "function" ? field.disabled(values) : Boolean(field.disabled);
  const colSpanClass = field.colSpan === 2 ? "md:col-span-2" : "md:col-span-1";

  return (
    <div className={`space-y-1.5 ${colSpanClass}`}>
      <div className="flex items-center justify-between">
        <Label htmlFor={inputId} className="text-xs font-medium text-text">
          {field.label}
          {field.required && <span className="text-danger ml-0.5">*</span>}
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

      {field.description && !error && (
        <p className="text-[11px] text-text-muted">{field.description}</p>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger font-medium animate-in fade-in">
          {error}
        </p>
      )}
    </div>
  );
}

interface FieldControlProps<T extends object> {
  field: FormFieldConfig<T>;
  inputId: string;
  value: unknown;
  isDisabled: boolean;
  error?: string;
  onChange: (val: unknown) => void;
}

/**
 * Dispatches control rendering based on FormFieldType.
 */
function FieldControl<T extends object>({
  field,
  inputId,
  value,
  isDisabled,
  error,
  onChange,
}: FieldControlProps<T>) {
  const errorBorder = error ? "border-danger focus:border-danger focus:ring-danger/20" : "";

  if (field.type === "switch") {
    return (
      <div className="flex items-center gap-2 pt-1">
        <Checkbox
          id={inputId}
          checked={Boolean(value)}
          disabled={isDisabled}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
        />
        <span className="text-xs text-text-secondary select-none">
          {field.placeholder || "Enable"}
        </span>
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <Textarea
        id={inputId}
        name={field.name}
        value={String(value ?? "")}
        placeholder={field.placeholder}
        disabled={isDisabled}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        className={errorBorder}
        rows={3}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        id={inputId}
        name={field.name}
        value={String(value ?? "")}
        disabled={isDisabled}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-action/20 focus:border-action transition-colors disabled:opacity-50 ${errorBorder}`}
      >
        {field.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <Input
      id={inputId}
      name={field.name}
      type={field.type === "number" ? "number" : field.type === "password" ? "password" : "text"}
      value={String(value ?? "")}
      placeholder={field.placeholder}
      disabled={isDisabled}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        const val = field.type === "number" ? Number(e.target.value) : e.target.value;
        onChange(val);
      }}
      className={errorBorder}
    />
  );
}
