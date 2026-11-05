import { z } from "zod";
import type { ConfigFormErrors, ConfigFormField } from "@/components/forms/config-form.types";
import type { FlagRecord } from "@/lib/flags-api";
import { fromDateTimeLocal, toDateTimeLocal } from "./flag-time";

/** Lifecycle edit schema: owner, expiry, removal ticket and default state. */

export interface FlagLifecycleFormValues {
  readonly owner: string;
  readonly expiresAt: string;
  readonly removalTicket: string;
  readonly defaultEnabled: string;
  readonly description: string;
}

export const FLAG_LIFECYCLE_FORM_FIELDS: readonly ConfigFormField<FlagLifecycleFormValues>[] = [
  {
    name: "owner",
    label: "Owner",
    type: "text",
    required: true,
    maxLength: 128,
    placeholder: "team-or-owner@example.com",
  },
  {
    name: "expiresAt",
    label: "Expires at (UTC)",
    type: "datetime-local",
    required: true,
    description: "Extend this before enabling an expired flag.",
  },
  {
    name: "removalTicket",
    label: "Removal ticket",
    type: "text",
    required: true,
    maxLength: 128,
    placeholder: "224",
    description: "Issue number that removes the flag.",
  },
  {
    name: "defaultEnabled",
    label: "Default state",
    type: "select",
    required: true,
    options: [
      { label: "Off (default)", value: "false" },
      { label: "On (default)", value: "true" },
    ],
    description:
      "The fallback when no targeting rule matches. The master switch is separate.",
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    colSpan: 2,
    maxLength: 255,
    rows: 2,
  },
];

const flagLifecycleSchema = z.object({
  owner: z
    .string()
    .trim()
    .min(1, "Enter the owner.")
    .max(128, "Keep the owner within 128 characters."),
  expiresAt: z
    .string()
    .min(1, "Choose an expiry.")
    .refine(
      (value) => fromDateTimeLocal(value).getTime() > Date.now(),
      "Choose a future date and time."
    ),
  removalTicket: z
    .string()
    .trim()
    .min(1, "Enter the removal ticket.")
    .max(128, "Keep the ticket within 128 characters.")
    .regex(/^#?\d+$/, "Use the issue number, for example 224."),
  defaultEnabled: z.enum(["true", "false"]),
  description: z
    .string()
    .trim()
    .max(255, "Keep the description within 255 characters."),
});

export function toFlagLifecycleForm(
  flag: FlagRecord
): FlagLifecycleFormValues {
  return {
    owner: flag.owner ?? "",
    expiresAt: toDateTimeLocal(flag.expiresAt),
    removalTicket: flag.removalTicket?.replace(/^#/, "") ?? "",
    defaultEnabled: String(flag.defaultEnabled),
    description: flag.description ?? "",
  };
}

export function validateFlagLifecycleForm(
  values: FlagLifecycleFormValues
): ConfigFormErrors<FlagLifecycleFormValues> {
  const result = flagLifecycleSchema.safeParse(values);
  if (result.success) {
    return {};
  }
  const errors: Partial<Record<keyof FlagLifecycleFormValues, string>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in errors)) {
      errors[key as keyof FlagLifecycleFormValues] = issue.message;
    }
  }
  return errors;
}

export function buildLifecycleUpdate(
  values: FlagLifecycleFormValues
): {
  readonly owner: string;
  readonly expiresAt: string;
  readonly removalTicket: string;
  readonly defaultEnabled: boolean;
  readonly description?: string;
} {
  const description = values.description.trim();
  return {
    owner: values.owner.trim(),
    expiresAt: fromDateTimeLocal(values.expiresAt).toISOString(),
    removalTicket: "#" + values.removalTicket.trim().replace(/^#/, ""),
    defaultEnabled: values.defaultEnabled === "true",
    ...(description === "" ? {} : { description }),
  };
}
