import { z } from "zod";
import type { FormConfig } from "@suite/ui";
import { PERMISSIONS } from "@suite/core";

export interface GeneralSettingsFormValues {
  name: string;
  customDomain?: string;
  currency: string;
  country: string;
  defaultLocale: string;
  jurisdiction: string;
  registeredAddressId?: string;
}

export const generalSettingsValidationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(191, "Organization name cannot exceed 191 characters"),
  customDomain: z
    .string()
    .trim()
    .max(191, "Custom domain cannot exceed 191 characters")
    .optional()
    .or(z.literal("")),
  currency: z
    .string()
    .trim()
    .length(3, "Currency must be a 3-letter ISO code (e.g., INR, USD)"),
  country: z
    .string()
    .trim()
    .length(2, "Country must be a 2-letter ISO country code (e.g., IN, US)"),
  defaultLocale: z
    .string()
    .trim()
    .min(2, "Locale must be at least 2 characters")
    .max(10, "Locale cannot exceed 10 characters"),
  jurisdiction: z
    .string()
    .trim()
    .min(2, "Jurisdiction must be at least 2 characters")
    .max(50, "Jurisdiction cannot exceed 50 characters"),
  registeredAddressId: z
    .string()
    .trim()
    .optional()
    .or(z.literal("")),
});

export function createGeneralSettingsFormConfig(
  slug: string,
  addressOptions: { label: string; value: string }[] = []
): FormConfig<GeneralSettingsFormValues> {
  return {
    id: "general-settings-form",
    title: "",
    stickyActionBar: {
      saveLabel: "Save Changes",
      discardLabel: "Discard",
      showDiscard: true,
    },
    sections: [
      {
        id: "organization-identity",
        title: "Organization Identity",
        description: "Primary legal entity branding and white-label custom domain.",
        permission: PERMISSIONS.CORE.ORGANIZATION_READ,
        fields: [
          {
            name: "name",
            label: "Organization Name",
            type: "text",
            required: true,
            placeholder: "e.g. Acme Corporation",
            colSpan: 1,
            permission: PERMISSIONS.CORE.ORGANIZATION_UPDATE,
          },
          {
            name: "customDomain",
            label: "Custom Domain",
            type: "text",
            placeholder: "e.g. app.acmecorp.com",
            description: "Optional custom CNAME domain mapped to this tenant.",
            colSpan: 1,
            permission: PERMISSIONS.CORE.ORGANIZATION_UPDATE,
          },
        ],
      },
      {
        id: "statutory-address",
        title: "Statutory Headquarters Address",
        description: "Official registered postal address used for corporate tax invoices and legal profile.",
        permission: PERMISSIONS.CORE.ORGANIZATION_READ,
        fields: [
          {
            name: "registeredAddressId",
            label: "Registered HQ Address",
            type: "select",
            colSpan: 2,
            options: [
              { label: "None (Unassigned)", value: "" },
              ...addressOptions,
            ],
            description: "Select an address from your operational addresses directory or register a new one under Settings > Addresses.",
            permission: PERMISSIONS.CORE.ORGANIZATION_UPDATE,
          },
        ],
      },
      {
        id: "regional-defaults",
        title: "Regional & Localization Defaults",
        description: "Statutory jurisdiction, primary reporting currency, and country configuration.",
        permission: PERMISSIONS.CORE.ORGANIZATION_READ,
        fields: [
          {
            name: "currency",
            label: "Master Currency",
            type: "select",
            required: true,
            colSpan: 1,
            options: [
              { label: "INR (₹) - Indian Rupee", value: "INR" },
              { label: "USD ($) - US Dollar", value: "USD" },
              { label: "EUR (€) - Euro", value: "EUR" },
              { label: "AED (د.إ) - UAE Dirham", value: "AED" },
              { label: "GBP (£) - British Pound", value: "GBP" },
              { label: "SAR (﷼) - Saudi Riyal", value: "SAR" },
            ],
            permission: PERMISSIONS.CORE.ORGANIZATION_UPDATE,
          },
          {
            name: "country",
            label: "Headquarters Country",
            type: "select",
            required: true,
            colSpan: 1,
            options: [
              { label: "India (IN)", value: "IN" },
              { label: "United States (US)", value: "US" },
              { label: "United Arab Emirates (AE)", value: "AE" },
              { label: "United Kingdom (GB)", value: "GB" },
              { label: "Saudi Arabia (SA)", value: "SA" },
              { label: "France (FR)", value: "FR" },
              { label: "Germany (DE)", value: "DE" },
            ],
            permission: PERMISSIONS.CORE.ORGANIZATION_UPDATE,
          },
          {
            name: "defaultLocale",
            label: "Default Language / Locale",
            type: "select",
            required: true,
            colSpan: 1,
            options: [
              { label: "English (en)", value: "en" },
              { label: "Hindi (hi)", value: "hi" },
              { label: "Arabic (ar)", value: "ar" },
              { label: "French (fr)", value: "fr" },
              { label: "German (de)", value: "de" },
              { label: "Spanish (es)", value: "es" },
            ],
            permission: PERMISSIONS.CORE.ORGANIZATION_UPDATE,
          },
          {
            name: "jurisdiction",
            label: "Regulatory Jurisdiction",
            type: "select",
            required: true,
            colSpan: 1,
            options: [
              { label: "India Default (IN_DEFAULT)", value: "IN_DEFAULT" },
              { label: "UAE Dubai (AE_DUBAI)", value: "AE_DUBAI" },
              { label: "Saudi Arabia ZATCA (SA_ZATCA)", value: "SA_ZATCA" },
              {
                label: "United States Default (US_DEFAULT)",
                value: "US_DEFAULT",
              },
              {
                label: "European Union Default (EU_DEFAULT)",
                value: "EU_DEFAULT",
              },
            ],
            permission: PERMISSIONS.CORE.ORGANIZATION_UPDATE,
          },
        ],
      },
      {
        id: "danger-archive",
        title: "Archive Organization",
        description:
          "Archiving this organization will immediately disable user access, halt cron workflows, and mark this tenant as archived. This action cannot be undone.",
        isDangerZone: true,
        dangerConfirmationSlug: slug,
        permission: PERMISSIONS.CORE.ORGANIZATION_UPDATE,
      },
    ],
  };
}
