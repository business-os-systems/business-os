"use client";

import type { ConfigFormErrors } from "@/components/forms/config-form.types";
import { useConfigForm } from "@/components/forms/use-config-form";
import {
  EMPTY_CATALOG_VALUE_FORM,
  buildCreateCatalogValueBody,
  buildUpdateCatalogValueBody,
  validateCreateCatalogValueForm,
  validateEditCatalogValueForm,
  type CatalogValueFormValues,
} from "@/components/forms/catalog-value-form.config";
import {
  createCatalogValue,
  updateCatalogValue,
  type Catalog,
  type CatalogValue,
} from "@/lib/catalogs-api";
import { useCatalogMutation, type CatalogMutation } from "./use-catalog-mutation";

export interface CatalogValueFormController {
  readonly values: CatalogValueFormValues;
  readonly errors: ConfigFormErrors<CatalogValueFormValues>;
  readonly mutation: CatalogMutation;
  readonly updateField: (
    name: keyof CatalogValueFormValues,
    next: string,
  ) => void;
  readonly save: () => Promise<void>;
}

export function toCatalogValueFormValues(
  value: CatalogValue | null,
): CatalogValueFormValues {
  if (value === null) {
    return EMPTY_CATALOG_VALUE_FORM;
  }
  return {
    code: value.code,
    label: value.label,
    sortOrder: String(value.sortOrder),
  };
}

export function useCatalogValueForm(
  catalog: Catalog,
  value: CatalogValue | null,
  onSaved: (value: CatalogValue) => void,
): CatalogValueFormController {
  const form = useConfigForm<CatalogValueFormValues>({
    initialValues: toCatalogValueFormValues(value),
  });
  const mutation = useCatalogMutation();
  const { values } = form;

  async function save(): Promise<void> {
    const nextErrors =
      value === null
        ? validateCreateCatalogValueForm(catalog.key, values)
        : validateEditCatalogValueForm(values);
    form.setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    await mutation.run(async () => {
      if (value === null) {
        return createCatalogValue({
          catalogKey: catalog.key,
          body: buildCreateCatalogValueBody(catalog.key, values),
        });
      }
      return updateCatalogValue({
        catalogKey: catalog.key,
        code: value.code,
        body: buildUpdateCatalogValueBody(values, value.version),
      });
    }, onSaved);
  }

  return {
    values: form.values,
    errors: form.errors,
    mutation,
    updateField: form.updateField,
    save,
  };
}
