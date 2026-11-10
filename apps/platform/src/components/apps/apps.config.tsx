import type { TableActionConfig, TableConfig } from "@suite/ui";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import { formatDateTime } from "@/lib/format";
import {
  APP_CATALOG_AVAILABILITIES,
  APP_CATALOG_AVAILABILITY_LABELS,
  MAX_CATALOG_SORT_ORDER,
  type AppCatalogAvailability,
  type CatalogApp,
} from "@/lib/apps-api";
import type { ConfigFormField } from "@/components/forms/config-form.types";

const AVAILABILITY_CLASS: Readonly<Record<AppCatalogAvailability, string>> = {
  HIDDEN: "text-text-muted",
  PREVIEW: "text-warning",
  AVAILABLE: "text-success",
  RETIRED: "text-text-secondary",
};

export const CATALOG_TABLE_CONFIG: TableConfig<CatalogApp> = {
  id: "platform-app-catalog",
  columns: [
    {
      key: "title",
      header: "Application",
      render: (_value, row) => (
        <span className="flex flex-col">
          <span className="font-medium text-text">{row.title}</span>
          <span className="text-xs text-text-muted">{row.appId}</span>
        </span>
      ),
    },
    {
      key: "availability",
      header: "Availability",
      render: (_value, row) => (
        <span className={`font-semibold ${AVAILABILITY_CLASS[row.availability]}`}>
          {APP_CATALOG_AVAILABILITY_LABELS[row.availability]}
        </span>
      ),
    },
    { key: "sortOrder", header: "Order", align: "right" },
    {
      key: "category",
      header: "Category",
      render: (value) =>
        typeof value === "string" ? value : <span className="text-text-muted">-</span>,
    },
    { key: "installedCount", header: "Installed", align: "right" },
    {
      key: "updatedAt",
      header: "Override updated",
      render: (value) =>
        typeof value === "string" ? formatDateTime(value) : (
          <span className="text-text-muted">Never</span>
        ),
    },
  ],
  emptyState: {
    title: "No applications in the catalog",
    description:
      "Applications come from the compiled registry. An empty catalog means no application is registered in this build.",
  },
};

export interface CatalogOverrideFormValues {
  readonly availability: string;
  readonly sortOrder: string;
  readonly category: string;
}

export const CATALOG_OVERRIDE_FORM_FIELDS: readonly ConfigFormField<CatalogOverrideFormValues>[] =
  [
    {
      name: "availability",
      label: "Availability",
      type: "select",
      required: true,
      options: APP_CATALOG_AVAILABILITIES.map((availability) => ({
        value: availability,
        label: APP_CATALOG_AVAILABILITY_LABELS[availability],
      })),
      description:
        "Hiding an application never disables it for a tenant that already installed it.",
    },
    {
      name: "sortOrder",
      label: "Display order",
      type: "text",
      required: true,
      placeholder: "0",
      description: "A lower number appears first in the catalog (0-10000).",
    },
    {
      name: "category",
      label: "Category",
      type: "text",
      placeholder: "e.g. content",
      description:
        "Lower-case slug. Leave empty to clear the override category.",
    },
  ];

export function toCatalogOverrideFormValues(
  app: CatalogApp
): CatalogOverrideFormValues {
  return {
    availability: app.availability,
    sortOrder: String(app.sortOrder),
    category: app.category ?? "",
  };
}

const SORT_ORDER_PATTERN = /^\d+$/;
const CATEGORY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

function isAppCatalogAvailability(
  value: string
): value is AppCatalogAvailability {
  return APP_CATALOG_AVAILABILITIES.some((item) => item === value);
}

export function validateCatalogOverrideForm(
  values: CatalogOverrideFormValues
): Partial<Record<keyof CatalogOverrideFormValues, string>> {
  const errors: Partial<Record<keyof CatalogOverrideFormValues, string>> = {};
  if (!isAppCatalogAvailability(values.availability)) {
    errors.availability = "Choose a catalog availability.";
  }
  if (!SORT_ORDER_PATTERN.test(values.sortOrder.trim())) {
    errors.sortOrder = `Use a whole number between 0 and ${MAX_CATALOG_SORT_ORDER}.`;
  } else if (Number(values.sortOrder) > MAX_CATALOG_SORT_ORDER) {
    errors.sortOrder = `Use a whole number between 0 and ${MAX_CATALOG_SORT_ORDER}.`;
  }
  const category = values.category.trim();
  if (category !== "" && !CATEGORY_PATTERN.test(category)) {
    errors.category = "Use a lower-case slug: letters, digits, underscore or hyphen.";
  }
  return errors;
}

/** Row actions for the catalog table; the engine enforces the declared permission. */
export function catalogRowActions(
  onEditOverride: (app: CatalogApp) => void,
): readonly TableActionConfig<CatalogApp>[] {
  return [
    {
      id: "edit-override",
      label: "Edit override",
      permission: PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
      onClick: onEditOverride,
    },
  ];
}

export function buildCatalogOverrideBody(
  values: CatalogOverrideFormValues,
  expectedVersion: string | null
) {
  const category = values.category.trim();
  if (!isAppCatalogAvailability(values.availability)) {
    throw new Error("The selected catalog availability is not registered.");
  }
  return {
    availability: values.availability,
    sortOrder: Number(values.sortOrder.trim()),
    category: category === "" ? null : category,
    expectedVersion,
  };
}
