import {
  MAX_CATALOG_SORT_ORDER,
  validateCatalogCode,
  type CatalogKey,
} from "@suite/core";
import type { ConfigFormErrors, ConfigFormField } from "./config-form.types";
import type {
  CatalogValueStatusBody,
  CreateCatalogValueBody,
  UpdateCatalogValueBody,
} from "@/lib/catalogs-api";

/** Add and edit share one value shape; only the create flow edits the code. */
export interface CatalogValueFormValues {
  readonly code: string;
  readonly label: string;
  readonly sortOrder: string;
}

export interface RetireConfirmationValues {
  readonly confirmation: string;
}

const MAX_LABEL_LENGTH = 191;
const SORT_ORDER_PATTERN = /^\d+$/;

export const EMPTY_CATALOG_VALUE_FORM: CatalogValueFormValues = {
  code: "",
  label: "",
  sortOrder: "0",
};

export const CATALOG_VALUE_CREATE_FIELDS: readonly ConfigFormField<CatalogValueFormValues>[] =
  [
    {
      name: "code",
      label: "Code",
      type: "text",
      required: true,
      maxLength: 64,
      placeholder: "e.g. USD",
      description:
        "Validated and normalized against the catalog's standard on save.",
    },
    {
      name: "label",
      label: "Label",
      type: "text",
      required: true,
      maxLength: MAX_LABEL_LENGTH,
      placeholder: "e.g. US Dollar",
      description: "The human-readable name every application displays.",
    },
    {
      name: "sortOrder",
      label: "Display order",
      type: "text",
      required: true,
      placeholder: "0",
      description: `Lower numbers appear first (0-${MAX_CATALOG_SORT_ORDER}).`,
    },
  ];

export const CATALOG_VALUE_EDIT_FIELDS: readonly ConfigFormField<CatalogValueFormValues>[] =
  [
    {
      name: "label",
      label: "Label",
      type: "text",
      required: true,
      maxLength: MAX_LABEL_LENGTH,
      description: "The code itself is immutable; retire the value to hide it.",
    },
    {
      name: "sortOrder",
      label: "Display order",
      type: "text",
      required: true,
      placeholder: "0",
      description: `Lower numbers appear first (0-${MAX_CATALOG_SORT_ORDER}).`,
    },
  ];

function validateLabel(label: string): string | undefined {
  const trimmed = label.trim();
  if (trimmed === "") {
    return "A label is required.";
  }
  if (trimmed.length > MAX_LABEL_LENGTH) {
    return `Use at most ${MAX_LABEL_LENGTH} characters.`;
  }
  return undefined;
}

function validateSortOrder(sortOrder: string): string | undefined {
  const trimmed = sortOrder.trim();
  if (!SORT_ORDER_PATTERN.test(trimmed)) {
    return `Use a whole number between 0 and ${MAX_CATALOG_SORT_ORDER}.`;
  }
  if (Number(trimmed) > MAX_CATALOG_SORT_ORDER) {
    return `Use a whole number between 0 and ${MAX_CATALOG_SORT_ORDER}.`;
  }
  return undefined;
}

export function validateCreateCatalogValueForm(
  catalogKey: CatalogKey,
  values: CatalogValueFormValues,
): ConfigFormErrors<CatalogValueFormValues> {
  const errors: ConfigFormErrors<CatalogValueFormValues> = {};
  const code = validateCatalogCode(catalogKey, values.code);
  if (!code.valid) {
    errors.code = code.reason;
  }
  const labelError = validateLabel(values.label);
  if (labelError !== undefined) {
    errors.label = labelError;
  }
  const sortOrderError = validateSortOrder(values.sortOrder);
  if (sortOrderError !== undefined) {
    errors.sortOrder = sortOrderError;
  }
  return errors;
}

export function validateEditCatalogValueForm(
  values: CatalogValueFormValues,
): ConfigFormErrors<CatalogValueFormValues> {
  const errors: ConfigFormErrors<CatalogValueFormValues> = {};
  const labelError = validateLabel(values.label);
  if (labelError !== undefined) {
    errors.label = labelError;
  }
  const sortOrderError = validateSortOrder(values.sortOrder);
  if (sortOrderError !== undefined) {
    errors.sortOrder = sortOrderError;
  }
  return errors;
}

export function buildCreateCatalogValueBody(
  catalogKey: CatalogKey,
  values: CatalogValueFormValues,
): CreateCatalogValueBody {
  const code = validateCatalogCode(catalogKey, values.code);
  if (!code.valid) {
    throw new Error(code.reason);
  }
  return {
    code: code.normalized,
    label: values.label.trim(),
    sortOrder: Number(values.sortOrder.trim()),
  };
}

export function buildUpdateCatalogValueBody(
  values: CatalogValueFormValues,
  expectedVersion: number,
): UpdateCatalogValueBody {
  return {
    label: values.label.trim(),
    sortOrder: Number(values.sortOrder.trim()),
    expectedVersion,
  };
}

export function buildCatalogValueStatusBody(
  isActive: boolean,
  expectedVersion: number,
): CatalogValueStatusBody {
  return { isActive, expectedVersion };
}

/** Destructive confirmation types the canonical code, never a generic "yes". */
export function retireConfirmationField(
  code: string,
): readonly ConfigFormField<RetireConfirmationValues>[] {
  return [
    {
      name: "confirmation",
      label: `Type ${code} to confirm`,
      type: "text",
      required: true,
      maxLength: 64,
      colSpan: 2,
      placeholder: code,
      description:
        "Retiring keeps existing records readable but removes the value from every picker.",
    },
  ];
}

export function validateRetireConfirmation(
  values: RetireConfirmationValues,
  code: string,
): ConfigFormErrors<RetireConfirmationValues> {
  const errors: ConfigFormErrors<RetireConfirmationValues> = {};
  if (values.confirmation.trim() !== code) {
    errors.confirmation = `Type ${code} exactly to confirm the retirement.`;
  }
  return errors;
}
