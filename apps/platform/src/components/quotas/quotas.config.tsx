import type { TableConfig } from "@suite/ui";
import {
  MAX_QUOTA_LIMIT,
  QUOTA_KEY_CODES,
  QUOTA_RESOURCE_DEFINITIONS,
  isQuotaKey,
} from "@suite/core";
import { formatDateTime } from "@/lib/format";
import type { ConfigFormField } from "@/components/forms/config-form.types";
import {
  DECIMAL_LIMIT_PATTERN,
  quotaResourceLabel,
  quotaUnitLabel,
  type QuotaItem,
} from "@/lib/quotas-api";

const QUOTA_STATUS_PRESENTATION = {
  over: { label: "Over limit", className: "text-danger" },
  within: { label: "Within limit", className: "text-text-secondary" },
} as const;

function quotaStatusKey(isOverLimit: boolean): keyof typeof QUOTA_STATUS_PRESENTATION {
  return isOverLimit ? "over" : "within";
}

export const QUOTA_TABLE_CONFIG: TableConfig<QuotaItem> = {
  id: "tenant-quotas",
  columns: [
    {
      key: "resourceKey",
      header: "Resource",
      render: (_value, row) => quotaResourceLabel(row.resourceKey),
    },
    {
      key: "limitValue",
      header: "Limit",
      align: "right",
      render: (_value, row) => (
        <span className="font-medium">
          {row.limitValue} {quotaUnitLabel(row.unit)}
        </span>
      ),
    },
    {
      key: "isEnforced",
      header: "Enforced",
      align: "right",
      render: (value) => (value === true ? "Yes" : "No"),
    },
    {
      key: "isOverLimit",
      header: "Status",
      align: "right",
      render: (_value, row) => {
        const status = QUOTA_STATUS_PRESENTATION[quotaStatusKey(row.isOverLimit)];
        return (
          <span className={`font-semibold ${status.className}`}>
            {status.label}
          </span>
        );
      },
    },
    {
      key: "asOf",
      header: "Updated",
      align: "right",
      render: (value) =>
        typeof value === "string" ? formatDateTime(value) : "Not measured",
    },
  ],
  emptyState: {
    title: "No quotas configured",
    description:
      "This tenant has no limit configured. Add a quota to set a measured limit for a resource.",
  },
};

export interface QuotaFormValues {
  readonly resourceKey: string;
  readonly limitValue: string;
  readonly isEnforced: string;
}

export function quotaCreateFormFields(
  availableResources: readonly string[]
): readonly ConfigFormField<QuotaFormValues>[] {
  return [
    {
      name: "resourceKey",
      label: "Resource",
      type: "select",
      required: true,
      options: availableResources.filter(isQuotaKey).map((resourceKey) => ({
        value: resourceKey,
        label: QUOTA_RESOURCE_DEFINITIONS[resourceKey].label,
      })),
      description: "Only registered resources without a configured quota are offered.",
    },
    {
      name: "limitValue",
      label: "Limit",
      type: "text",
      required: true,
      placeholder: "0",
      description:
        "A non-negative whole number, stored as a decimal string. Use this exact value in the API.",
    },
    {
      name: "isEnforced",
      label: "Enforce this limit",
      type: "checkbox",
      description:
        "A limit cannot be enforced when consumption is not measured (FR-091).",
    },
  ];
}

export const QUOTA_UPDATE_FORM_FIELDS: readonly ConfigFormField<QuotaFormValues>[] =
  quotaCreateFormFields(QUOTA_KEY_CODES).filter(
    (field) => field.name !== "resourceKey"
  );

export function toQuotaUpdateFormValues(item: QuotaItem): QuotaFormValues {
  return {
    resourceKey: item.resourceKey,
    limitValue: item.limitValue,
    isEnforced: item.isEnforced ? "true" : "false",
  };
}

export function toQuotaCreateFormValues(
  resourceKey: string
): QuotaFormValues {
  return { resourceKey, limitValue: "", isEnforced: "false" };
}

export function validateQuotaForm(
  values: QuotaFormValues
): Partial<Record<keyof QuotaFormValues, string>> {
  const errors: Partial<Record<keyof QuotaFormValues, string>> = {};
  if (!isQuotaKey(values.resourceKey)) {
    errors.resourceKey = "Choose a registered quota resource.";
  }
  if (!DECIMAL_LIMIT_PATTERN.test(values.limitValue.trim())) {
    errors.limitValue = "Use a non-negative whole number.";
  } else if (BigInt(values.limitValue.trim()) > MAX_QUOTA_LIMIT) {
    errors.limitValue = "Value exceeds a signed 64-bit integer.";
  }
  if (
    values.isEnforced === "true" &&
    isQuotaKey(values.resourceKey) &&
    !QUOTA_RESOURCE_DEFINITIONS[values.resourceKey].measurable
  ) {
    errors.isEnforced =
      "This resource cannot be enforced because consumption is not measured.";
  }
  return errors;
}

export function buildQuotaItem(
  values: QuotaFormValues,
  expectedVersion: string | null
) {
  if (!isQuotaKey(values.resourceKey)) {
    throw new Error("The selected quota resource is not registered.");
  }
  return {
    resourceKey: values.resourceKey,
    limitValue: values.limitValue.trim(),
    isEnforced: values.isEnforced === "true",
    expectedVersion,
  };
}

export function availableQuotaResources(
  items: readonly QuotaItem[]
): readonly string[] {
  const configured = new Set(items.map((item) => item.resourceKey));
  return QUOTA_KEY_CODES.filter((resourceKey) => !configured.has(resourceKey));
}

export function overLimitCount(items: readonly QuotaItem[]): number {
  return items.filter((item) => item.isOverLimit).length;
}
