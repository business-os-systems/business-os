"use client";

import { useMemo } from "react";
import { Alert } from "@suite/ui";
import { ConfigFormRenderer } from "@/components/forms/config-form-renderer";
import type {
  ConfigFormErrors,
  ConfigFormField,
} from "@/components/forms/config-form.types";
import type { CatalogDraft, CatalogIssue } from "@/lib/catalog-schema";
import {
  fieldText,
  type CatalogFormField,
} from "./catalog-form.config";

type FormValues = Record<string, string>;

interface CatalogFormProps {
  readonly fields: readonly CatalogFormField[];
  readonly draft: CatalogDraft;
  readonly issues: readonly CatalogIssue[];
  readonly disabled: boolean;
  readonly formId: string;
  readonly onChange: (field: CatalogFormField, value: string) => void;
}

function toRendererField(field: CatalogFormField): ConfigFormField<FormValues> {
  const base = {
    name: field.path,
    label: field.label,
    description: field.description,
    required: field.required,
  };
  if (field.control === "select" || field.control === "block-type") {
    return { ...base, type: "select", options: [...field.options] };
  }
  if (field.control === "textarea") {
    return { ...base, type: "textarea", rows: 3 };
  }
  return { ...base, type: "text" };
}

function buildValues(
  fields: readonly CatalogFormField[],
  draft: CatalogDraft,
): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    values[field.path] = fieldText(field, draft);
  }
  return values;
}

interface FormErrorsModel {
  readonly errors: ConfigFormErrors<FormValues>;
  readonly unmatched: readonly CatalogIssue[];
}

function buildErrors(
  fields: readonly CatalogFormField[],
  issues: readonly CatalogIssue[],
): FormErrorsModel {
  const byPath = new Map(fields.map((field) => [field.path, field]));
  const errors: ConfigFormErrors<FormValues> = {};
  const unmatched: CatalogIssue[] = [];
  for (const issue of issues) {
    if (byPath.has(issue.path)) {
      errors[issue.path] = issue.message;
    } else {
      unmatched.push(issue);
    }
  }
  return { errors, unmatched };
}

function UnmatchedIssues({ issues }: { readonly issues: readonly CatalogIssue[] }) {
  if (issues.length === 0) {
    return null;
  }
  return (
    <Alert
      variant="error"
      title="Validation failed"
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
  );
}

/** One layout for the generated form; the shared renderer owns every control. */
export function CatalogForm({
  fields,
  draft,
  issues,
  disabled,
  formId,
  onChange,
}: CatalogFormProps) {
  const rendererFields = useMemo(() => fields.map(toRendererField), [fields]);
  const values = useMemo(() => buildValues(fields, draft), [fields, draft]);
  const model = useMemo(() => buildErrors(fields, issues), [fields, issues]);
  const fieldByName = useMemo(
    () => new Map(fields.map((field) => [field.path, field])),
    [fields],
  );

  return (
    <div className="space-y-3">
      <ConfigFormRenderer
        fields={rendererFields}
        values={values}
        errors={model.errors}
        disabled={disabled}
        formId={formId}
        onChange={(name, value) => {
          const field = fieldByName.get(name);
          if (field !== undefined) {
            onChange(field, value);
          }
        }}
      />
      <UnmatchedIssues issues={model.unmatched} />
    </div>
  );
}
