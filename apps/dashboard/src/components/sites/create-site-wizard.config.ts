import { z } from "zod";
import type { FormConfig } from "@suite/ui";
import { siteSlugError } from "@suite/website-builder/paths";
import { WORKSPACE_ROOT } from "@/lib/workspace-paths";
import type { CmsTemplateDto } from "@/lib/api/site-client";

export interface SiteNameValues {
  title: string;
}

export interface SiteAddressValues {
  slug: string;
}

export interface SiteTemplateValues {
  templateId: string;
}

export type SiteWizardStep = "name" | "address" | "template";

export const SITE_WIZARD_STEP_ORDER: readonly SiteWizardStep[] = ["name", "address", "template"];

export const SITE_WIZARD_STEP_LABELS: Record<SiteWizardStep, string> = {
  name: "Name",
  address: "Address",
  template: "Template",
};

const titleSchema = z
  .string()
  .trim()
  .min(1, "Give the site a name.")
  .max(120, "Keep the name to 120 characters or fewer.");

const slugSchema = z.string().superRefine((value, ctx) => {
  const error = siteSlugError(value);
  if (error !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
  }
});

export const siteNameSchema = z.object({ title: titleSchema });
export const siteAddressSchema = z.object({ slug: slugSchema });
export const siteTemplateSchema = z.object({ templateId: z.string() });

export const siteNameFormConfig: FormConfig<SiteNameValues> = {
  id: "site-wizard-name",
  title: "Name the site",
  description: "This is the name your team sees in the studio and on the sites list.",
  sections: [
    {
      id: "site-identity",
      title: "Site identity",
      fields: [
        {
          name: "title",
          label: "Site name",
          type: "text",
          placeholder: "Riverview Bistro",
          required: true,
          colSpan: 2,
          description: "Use the public name of the business, not an internal code.",
        },
      ],
    },
  ],
};

function readAddressHelp(domainRoot: string): string {
  if (domainRoot.length === 0) {
    return "The address is the tenant label used for this site. Your workspace administrator can attach a domain later.";
  }
  return "The site is served at <address>." + domainRoot + " and the workspace stays under " + WORKSPACE_ROOT + ".";
}

export function createSiteAddressConfig(domainRoot: string): FormConfig<SiteAddressValues> {
  return {
    id: "site-wizard-address",
    title: "Choose the address",
    description: readAddressHelp(domainRoot),
    sections: [
      {
        id: "site-address",
        title: "Site address",
        fields: [
          {
            name: "slug",
            label: "Address",
            type: "text",
            placeholder: "riverview-bistro",
            required: true,
            colSpan: 2,
            description: "Lower-case letters, digits and hyphens. Reserved platform names are refused.",
          },
        ],
      },
    ],
  };
}

export function createSiteTemplateConfig(
  templates: readonly CmsTemplateDto[]
): FormConfig<SiteTemplateValues> {
  const options = [
    { label: "Blank site", value: "" },
    ...templates.map((template) => ({
      label: template.name + " (" + template.category + ")",
      value: template.id,
    })),
  ];
  return {
    id: "site-wizard-template",
    title: "Pick a starting point",
    description: "A published template copies its pages and content into this site. Blank starts with one home page.",
    sections: [
      {
        id: "site-template",
        title: "Template",
        fields: [
          {
            name: "templateId",
            label: "Template",
            type: "select",
            options,
            required: true,
            colSpan: 2,
            description: "Only templates published for your workspace are listed.",
          },
        ],
      },
    ],
  };
}
