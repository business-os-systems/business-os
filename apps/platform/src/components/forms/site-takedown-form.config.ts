import type { ConfigFormField } from "./config-form.types";
import type {
  CmsSiteStatus,
  SiteTakedownAction,
  SiteTakedownBody,
  TenantSite,
} from "@/lib/site-takedown-api";

export interface SiteTakedownFormValues {
  readonly reason: string;
  readonly confirmSite: string;
}

export type SiteTakedownFieldConfig = ConfigFormField<SiteTakedownFormValues>;

export const SITE_TAKEDOWN_CONFIG = {
  SUSPEND: {
    label: "Suspend site",
    dialogTitle: "Suspend this site",
    description:
      "Stops public delivery at every host immediately. The site and its content are retained as evidence.",
    reasonLabel: "Reason",
    confirmLabel: "Confirm suspension",
    pendingLabel: "Suspending...",
    successMessage: "Site suspended. Its hosts now return a holding response.",
    variant: "destructive",
  },
  RESTORE: {
    label: "Restore site",
    dialogTitle: "Restore this site",
    description:
      "Returns the site to the status it held before suspension. Public delivery resumes at its hosts.",
    reasonLabel: "Reason",
    confirmLabel: "Confirm restore",
    pendingLabel: "Restoring...",
    successMessage: "Site restored to its previous status.",
    variant: "default",
  },
} as const satisfies Record<
  SiteTakedownAction,
  {
    readonly label: string;
    readonly dialogTitle: string;
    readonly description: string;
    readonly reasonLabel: string;
    readonly confirmLabel: string;
    readonly pendingLabel: string;
    readonly successMessage: string;
    readonly variant: "destructive" | "default";
  }
>;

export const CMS_SITE_STATUS_LABELS: Record<CmsSiteStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  MAINTENANCE: "Maintenance",
  SUSPENDED: "Suspended",
  ARCHIVED: "Archived",
};

export function canSuspendSite(status: CmsSiteStatus): boolean {
  return status === "PUBLISHED" || status === "MAINTENANCE";
}

export function canRestoreSite(status: CmsSiteStatus): boolean {
  return status === "SUSPENDED";
}

export function siteTakedownFields(
  site: Pick<TenantSite, "slug">
): SiteTakedownFieldConfig[] {
  return [
    {
      name: "reason",
      label: "Reason",
      type: "textarea",
      required: true,
      colSpan: 2,
      maxLength: 255,
      placeholder: "What was reported and what was verified",
      description:
        "1-255 characters. Stored with the suspension and both audit rows. Do not include personal data.",
    },
    {
      name: "confirmSite",
      label: "Type " + site.slug + " to confirm",
      type: "text",
      required: true,
      maxLength: 191,
      placeholder: site.slug,
      highlight: site.slug,
      description: "The site slug must match exactly.",
    },
  ];
}

export const SITE_REASON_MIN_MESSAGE = "Enter a reason.";
export const SITE_REASON_MAX_MESSAGE = "Keep the reason within 255 characters.";
export const SITE_CONFIRM_EMPTY_MESSAGE = "Retype the site slug to confirm.";
export const SITE_CONFIRM_MISMATCH_MESSAGE = "The slug does not match this site.";

export interface SiteTakedownFieldErrors {
  readonly reason?: string;
  readonly confirmSite?: string;
}

export function validateSiteTakedownForm(input: {
  readonly values: SiteTakedownFormValues;
  readonly slug: string;
}): SiteTakedownFieldErrors {
  const errors: { reason?: string; confirmSite?: string } = {};
  const reason = input.values.reason.trim();
  const confirmSite = input.values.confirmSite.trim();
  if (reason.length === 0) {
    errors.reason = SITE_REASON_MIN_MESSAGE;
  } else if (reason.length > 255) {
    errors.reason = SITE_REASON_MAX_MESSAGE;
  }
  if (confirmSite.length === 0) {
    errors.confirmSite = SITE_CONFIRM_EMPTY_MESSAGE;
  } else if (confirmSite !== input.slug) {
    errors.confirmSite = SITE_CONFIRM_MISMATCH_MESSAGE;
  }
  return errors;
}

export function buildSiteTakedownBody(input: {
  readonly values: SiteTakedownFormValues;
  readonly site: Pick<TenantSite, "status">;
}): SiteTakedownBody {
  return {
    reason: input.values.reason.trim(),
    expectedStatus: input.site.status,
  };
}
