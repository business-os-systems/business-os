import {
  PLATFORM_CAPABILITIES, TENANT_LIFECYCLE_ACTION,
  TENANT_LIFECYCLE_REASON_MAX_LENGTH, TENANT_LIFECYCLE_REASON_MIN_LENGTH,
  TENANT_LIFECYCLE_TRANSITIONS, canApplyLifecycleAction,
  type TenantLifecycleAction, type TenantStatus,
} from "@suite/core";
import { z } from "zod";
import type { ConfigFormField } from "./config-form.types";
import { hasPlatformCapability } from "@/lib/capability";
import type { TenantLifecycleBody, TenantRecord } from "@/lib/tenant-api";

/** Declarative lifecycle schema: the modal and the action bar both read it. */
export interface LifecycleFormValues { readonly reason: string; readonly confirmSlug: string }
export type LifecycleTenant = Pick<TenantRecord["profile"], "id" | "name" | "slug" | "status">;

export type LifecycleFieldConfig = ConfigFormField<LifecycleFormValues>;

export const LIFECYCLE_ACTION_CONFIG = {
  [TENANT_LIFECYCLE_ACTION.SUSPEND]: { label: "Suspend", confirmLabel: "Suspend tenant", pendingLabel: "Suspending...", description: "Blocks every tenant sign-in and request within sixty seconds. Data is retained.", successMessage: "Tenant suspended.", variant: "secondary" },
  [TENANT_LIFECYCLE_ACTION.RESTORE]: { label: "Restore", confirmLabel: "Restore tenant", pendingLabel: "Restoring...", description: "Returns the tenant to the status it held before suspension and notifies its administrators.", successMessage: "Tenant restored.", variant: "default" },
  [TENANT_LIFECYCLE_ACTION.ARCHIVE]: { label: "Archive", confirmLabel: "Archive tenant", pendingLabel: "Archiving...", description: "Makes the tenant's data inaccessible while retaining it. This screen offers no unarchive.", successMessage: "Tenant archived.", variant: "destructive" },
} as const satisfies Record<TenantLifecycleAction, {
  readonly label: string; readonly confirmLabel: string; readonly pendingLabel: string;
  readonly description: string; readonly successMessage: string;
  readonly variant: "secondary" | "default" | "destructive";
}>;
const ACTION_ORDER = [TENANT_LIFECYCLE_ACTION.SUSPEND, TENANT_LIFECYCLE_ACTION.RESTORE, TENANT_LIFECYCLE_ACTION.ARCHIVE] as const;

/** Missing or empty capability context denies, never widens access. */
export function canManageLifecycle(capabilities: readonly string[] | undefined | null): boolean {
  return hasPlatformCapability(capabilities, PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code);
}

export function availableLifecycleActions(status: TenantStatus): TenantLifecycleAction[] {
  return ACTION_ORDER.filter((action) => canApplyLifecycleAction(action, status));
}

export function lifecycleFormFields(input: { readonly action: TenantLifecycleAction; readonly slug: string }): LifecycleFieldConfig[] {
  const fields: LifecycleFieldConfig[] = [{
    name: "reason", label: "Reason", type: "textarea", required: true, colSpan: 2,
    maxLength: TENANT_LIFECYCLE_REASON_MAX_LENGTH,
    placeholder: "Operational reason (no member personal data)",
    description: `${TENANT_LIFECYCLE_REASON_MIN_LENGTH}-${TENANT_LIFECYCLE_REASON_MAX_LENGTH} characters. Stored with the lifecycle record and audit row. Do not include member personal data.`,
    permission: PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code,
  }];
  if (!TENANT_LIFECYCLE_TRANSITIONS[input.action].requiresConfirmationSlug) return fields;
  return [...fields, {
    name: "confirmSlug", label: `Type ${input.slug} to confirm`, type: "text",
    required: true, maxLength: 191, placeholder: input.slug, highlight: input.slug,
    description: "The slug must match exactly.",
    permission: PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code,
  }];
}

export const LIFECYCLE_REASON_MIN_MESSAGE = `Enter at least ${TENANT_LIFECYCLE_REASON_MIN_LENGTH} characters.`;
export const LIFECYCLE_REASON_MAX_MESSAGE = `Keep the reason within ${TENANT_LIFECYCLE_REASON_MAX_LENGTH} characters.`;
export const LIFECYCLE_SLUG_EMPTY_MESSAGE = "Retype the tenant slug to confirm.";
export const LIFECYCLE_SLUG_MISMATCH_MESSAGE = "The slug does not match this tenant.";
export type LifecycleFieldErrors = { readonly reason?: string; readonly confirmSlug?: string };

export function lifecycleFormSchema(input: { readonly action: TenantLifecycleAction; readonly slug: string }): z.ZodType<LifecycleFormValues> {
  const reason = z.string().transform((value) => value.trim()).pipe(
    z.string().min(TENANT_LIFECYCLE_REASON_MIN_LENGTH, LIFECYCLE_REASON_MIN_MESSAGE).max(TENANT_LIFECYCLE_REASON_MAX_LENGTH, LIFECYCLE_REASON_MAX_MESSAGE),
  );
  return z.object({ reason, confirmSlug: z.string().transform((value) => value.trim()) }).superRefine((values, context) => {
    if (!TENANT_LIFECYCLE_TRANSITIONS[input.action].requiresConfirmationSlug) return;
    if (values.confirmSlug === "") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmSlug"], message: LIFECYCLE_SLUG_EMPTY_MESSAGE });
    } else if (values.confirmSlug !== input.slug) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmSlug"], message: LIFECYCLE_SLUG_MISMATCH_MESSAGE });
    }
  });
}

export function validateLifecycleForm(input: { readonly action: TenantLifecycleAction; readonly values: LifecycleFormValues; readonly slug: string }): LifecycleFieldErrors {
  const result = lifecycleFormSchema(input).safeParse(input.values);
  if (result.success) return {};
  const errors: { reason?: string; confirmSlug?: string } = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (key === "reason" || key === "confirmSlug") errors[key] = issue.message;
  }
  return errors;
}

/** expectedStatus is what the operator saw; a stale value is a LIFECYCLE_CONFLICT. */
export function buildLifecycleBody(input: { readonly action: TenantLifecycleAction; readonly values: LifecycleFormValues; readonly expectedStatus: TenantStatus }): TenantLifecycleBody {
  const body = { reason: input.values.reason.trim(), expectedStatus: input.expectedStatus };
  if (!TENANT_LIFECYCLE_TRANSITIONS[input.action].requiresConfirmationSlug) return body;
  return { ...body, confirmSlug: input.values.confirmSlug.trim() };
}

export const LIFECYCLE_CONFLICT_TITLE = "Status changed - reload";
export const LIFECYCLE_CONFLICT_MESSAGE = "This tenant's status changed since you opened the record. Reload it to see the current state before trying again.";
