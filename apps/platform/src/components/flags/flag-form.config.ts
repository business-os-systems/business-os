import { z } from "zod";
import { FLAG_ENVIRONMENTS } from "@suite/flags/contracts";
import type { ConfigFormErrors, ConfigFormField } from "@/components/forms/config-form.types";
import {
  FLAG_ENVIRONMENT_OPTIONS,
  isFlagEnvironment,
  type CreateFlagBody,
} from "@/lib/flags-api";
import { fromDateTimeLocal } from "./flag-time";

/** Declarative create-flag schema for the Platform tab. */

export interface FlagFormValues {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly environment: string;
  readonly owner: string;
  readonly expiresAt: string;
  readonly removalTicket: string;
}

export const EMPTY_FLAG_FORM: FlagFormValues = {
  key: "",
  name: "",
  description: "",
  environment: FLAG_ENVIRONMENTS[0],
  owner: "",
  expiresAt: "",
  removalTicket: "",
};

export const FLAG_FORM_FIELDS: readonly ConfigFormField<FlagFormValues>[] = [
  {
    name: "key",
    label: "Flag key",
    type: "text",
    required: true,
    maxLength: 64,
    placeholder: "pos.offline_mode",
  },
  {
    name: "name",
    label: "Name",
    type: "text",
    required: true,
    maxLength: 128,
    placeholder: "Offline mode",
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    colSpan: 2,
    maxLength: 255,
    rows: 2,
    placeholder: "What the flag changes and when it should be removed.",
  },
  {
    name: "environment",
    label: "Environment",
    type: "select",
    required: true,
    options: FLAG_ENVIRONMENT_OPTIONS,
  },
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
  },
  {
    name: "removalTicket",
    label: "Removal ticket",
    type: "text",
    required: true,
    maxLength: 128,
    placeholder: "224",
  },
];

const expirySchema = z
  .string()
  .min(1, "Choose an expiry.")
  .refine(
    (value) => fromDateTimeLocal(value).getTime() > Date.now(),
    "Choose a future date and time."
  );

export const flagFormSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Enter a flag key.")
    .max(64, "Keep the key within 64 characters.")
    .regex(
      /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)+$/,
      "Use a dot (.) between app and feature, for example pos.offline_mode."
    ),
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(128, "Keep the name within 128 characters."),
  description: z
    .string()
    .trim()
    .max(255, "Keep the description within 255 characters."),
  environment: z.enum(FLAG_ENVIRONMENTS),
  owner: z
    .string()
    .trim()
    .min(1, "Enter the owner.")
    .max(128, "Keep the owner within 128 characters."),
  expiresAt: expirySchema,
  removalTicket: z
    .string()
    .trim()
    .min(1, "Enter the removal ticket.")
    .max(128, "Keep the ticket within 128 characters.")
    .regex(/^#?\d+$/, "Use the issue number, for example 224."),
});

export function validateFlagForm(
  values: FlagFormValues
): ConfigFormErrors<FlagFormValues> {
  const result = flagFormSchema.safeParse(values);
  if (result.success) {
    return {};
  }
  const errors: Partial<Record<keyof FlagFormValues, string>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in errors)) {
      errors[key as keyof FlagFormValues] = issue.message;
    }
  }
  return errors;
}

export function buildCreateFlagBody(values: FlagFormValues): CreateFlagBody {
  if (!isFlagEnvironment(values.environment)) {
    throw new Error("Choose a valid environment.");
  }
  const description = values.description.trim();
  return {
    key: values.key.trim(),
    name: values.name.trim(),
    environment: values.environment,
    owner: values.owner.trim(),
    expiresAt: fromDateTimeLocal(values.expiresAt).toISOString(),
    removalTicket: "#" + values.removalTicket.trim().replace(/^#/, ""),
    ...(description === "" ? {} : { description }),
  };
}
