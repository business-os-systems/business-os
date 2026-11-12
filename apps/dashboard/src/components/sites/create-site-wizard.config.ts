import { z } from "zod";
import type { FormConfig } from "@suite/ui";
import { siteSlugError } from "@suite/website-builder/paths";
import { WORKSPACE_ROOT } from "@/lib/workspace-paths";
import type { CmsTemplateDto } from "@/lib/api/site-client";

export interface SiteDraftValues {
  readonly title: string;
  readonly slug: string;
  readonly templateId: string;
}

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

/** One form, one request: name, address and starting point (FR-078, T164). */
export const siteDraftSchema = siteNameSchema
  .merge(siteAddressSchema)
  .merge(siteTemplateSchema);

function readAddressHelp(domainRoot: string): string {
  if (domainRoot.length === 0) {
    return "The address is the tenant label used for this site. Your workspace administrator can attach a domain later.";
  }
  return "The site is served at <address>." + domainRoot + " and the workspace stays under " + WORKSPACE_ROOT + ".";
}

function templateOptions(templates: readonly CmsTemplateDto[]) {
  return [
    { label: "Blank site", value: "" },
    ...templates.map((template) => ({
      label: template.name + " (" + template.category + ")",
      value: template.id,
    })),
  ];
}

/**
 * The single create-site form. Name and address are the required inputs; the
 * starting point defaults to a blank home page, so a creation with no template
 * still lands in the studio on the home page (FR-078).
 */
export function createSiteFormConfig(
  domainRoot: string,
  templates: readonly CmsTemplateDto[]
): FormConfig<SiteDraftValues> {
  return {
    id: "site-create",
    title: "Create a website",
    description:
      "Name the site and choose its address. The studio opens on the new home page as soon as it exists.",
    sections: [
      {
        id: "site-identity",
        title: "Site",
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
          {
            name: "slug",
            label: "Address",
            type: "text",
            placeholder: "riverview-bistro",
            required: true,
            colSpan: 2,
            description: readAddressHelp(domainRoot) + " Lower-case letters, digits and hyphens.",
          },
          {
            name: "templateId",
            label: "Starting point",
            type: "select",
            options: templateOptions(templates),
            required: true,
            colSpan: 2,
            description: "A published template copies its pages and content. Blank starts with one home page.",
          },
        ],
      },
    ],
    stickyActionBar: { saveLabel: "Create site and open studio", showDiscard: false },
  };
}
