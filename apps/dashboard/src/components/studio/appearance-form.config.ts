import { z } from "zod";
import { PERMISSIONS } from "@suite/core";
import type {
  FormConfig,
  FormFieldOption,
  StandardFormSection,
} from "@suite/ui";
import {
  BRAND_LOGO_URL_MAX_LENGTH,
  DEFAULT_APPEARANCE_TOKENS,
  isSafeBrandLogoUrl,
  type AppearanceTokens,
} from "@suite/website-builder/appearance";

/**
 * Appearance panel form contract (T117, FR-151).
 *
 * Every field is declared here; the panel renders the schema through
 * ConfigFormRenderer instead of hand-writing inputs (Config-UI Primacy Law).
 */

export interface FontPairingOption {
  readonly id: string;
  readonly label: string;
  readonly heading: string;
  readonly body: string;
}

export const FONT_PAIRINGS: readonly FontPairingOption[] = [
  {
    id: "inter",
    label: "Inter (modern neutral)",
    heading: "Inter, system-ui, sans-serif",
    body: "Inter, system-ui, sans-serif",
  },
  {
    id: "playfair-inter",
    label: "Playfair Display + Inter",
    heading: "Playfair Display, Georgia, serif",
    body: "Inter, system-ui, sans-serif",
  },
  {
    id: "dm-serif-dm-sans",
    label: "DM Serif Display + DM Sans",
    heading: "DM Serif Display, Georgia, serif",
    body: "DM Sans, system-ui, sans-serif",
  },
  {
    id: "georgia-source",
    label: "Georgia + Source Sans 3",
    heading: "Georgia, serif",
    body: "Source Sans 3, system-ui, sans-serif",
  },
];

export const CUSTOM_FONT_PAIRING_ID = "custom";

export interface AppearanceFormValues {
  brandName: string;
  brandLogoUrl: string;
  primaryColor: string;
  fontPairing: string;
}

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

export const appearanceFormSchema = z.object({
  brandName: z.string().trim().min(1, "Enter the brand name visitors should see.").max(191),
  brandLogoUrl: z
    .string()
    .trim()
    .max(BRAND_LOGO_URL_MAX_LENGTH)
    .refine(
      (value) => value.length === 0 || isSafeBrandLogoUrl(value),
      "Use a workspace path or an absolute HTTPS URL."
    ),
  primaryColor: z
    .string()
    .trim()
    .regex(HEX_COLOUR, "Use a six-digit hex colour."),
  fontPairing: z.string().trim().min(1, "Choose a font pairing."),
});

export function findFontPairing(id: string): FontPairingOption | null {
  return FONT_PAIRINGS.find((pairing) => pairing.id === id) ?? null;
}

/** The curated pair whose values the site currently stores, if any. */
export function matchFontPairing(tokens: AppearanceTokens): FontPairingOption | null {
  return (
    FONT_PAIRINGS.find(
      (pairing) => pairing.heading === tokens.fontHeading && pairing.body === tokens.fontBody
    ) ?? null
  );
}

/**
 * Curated options plus the current theme pair when it is not in the curated
 * list, so opening the panel never silently changes a site's fonts.
 */
export function fontPairingOptions(tokens: AppearanceTokens): FormFieldOption[] {
  const curated = FONT_PAIRINGS.map((pairing) => ({
    label: pairing.label,
    value: pairing.id,
  }));
  if (matchFontPairing(tokens) !== null) {
    return curated;
  }
  return [
    ...curated,
    { label: "Current theme fonts", value: CUSTOM_FONT_PAIRING_ID },
  ];
}

export function initialAppearanceFormValues(input: {
  readonly brandName: string;
  readonly brandLogoUrl: string | null;
  readonly tokens: AppearanceTokens;
}): AppearanceFormValues {
  const matched = matchFontPairing(input.tokens);
  return {
    brandName: input.brandName,
    brandLogoUrl: input.brandLogoUrl ?? "",
    primaryColor: input.tokens.colorPrimary,
    fontPairing: matched?.id ?? CUSTOM_FONT_PAIRING_ID,
  };
}

function brandSection(): StandardFormSection<AppearanceFormValues> {
  return {
    id: "brand",
    title: "Brand",
    description: "A name and an optional logo shown in the site header.",
    permission: PERMISSIONS.WEBSITE_BUILDER.THEME_MANAGE,
    fields: [
      {
        name: "brandName",
        label: "Brand name",
        type: "text",
        required: true,
        placeholder: "Your brand name",
        colSpan: 1,
      },
      {
        name: "brandLogoUrl",
        label: "Logo",
        type: "text",
        placeholder: "A workspace media path or an absolute HTTPS URL",
        description: "Use a workspace media path or an absolute HTTPS URL.",
        colSpan: 1,
      },
    ],
  };
}

function designSection(tokens: AppearanceTokens): StandardFormSection<AppearanceFormValues> {
  return {
    id: "design",
    title: "Design",
    description: "The primary colour and font pairing applied to every section.",
    permission: PERMISSIONS.WEBSITE_BUILDER.THEME_MANAGE,
    fields: [
      {
        name: "primaryColor",
        label: "Primary colour",
        type: "text",
        required: true,
        placeholder: DEFAULT_APPEARANCE_TOKENS.colorPrimary,
        description: "A six-digit hex value. The preview updates from your draft.",
        colSpan: 1,
      },
      {
        name: "fontPairing",
        label: "Font pairing",
        type: "select",
        required: true,
        options: fontPairingOptions(tokens),
        colSpan: 1,
      },
    ],
  };
}

export function appearanceFormConfig(tokens: AppearanceTokens): FormConfig<AppearanceFormValues> {
  return {
    id: "site-appearance",
    title: "Brand basics",
    description: "These values are stored on this site only. Publish to show them to visitors.",
    sections: [brandSection(), designSection(tokens)],
    stickyActionBar: {
      saveLabel: "Save draft",
      discardLabel: "Discard changes",
      showDiscard: true,
    },
  };
}
