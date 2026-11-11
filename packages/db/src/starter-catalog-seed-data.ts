import { CmsCatalogKind } from "@prisma/client";

/**
 * Deterministic starter catalog content (#372, F10, T141).
 *
 * The starter catalog is application content, not reference data: it ships the
 * launch sections, one site template and one theme every workspace receives so
 * the first website can be composed without hand-authoring catalog rows first.
 * Content lives here as data; the seed writes it to PostgreSQL (FR-016,
 * SC-001). Operators edit the records afterwards and the seed never overwrites
 * them.
 *
 * Every definition targets the published catalog contract `2026-03` and is
 * validated by the catalog admin API before a tenant ever reads it (FR-068,
 * FR-069, FR-070).
 */

export const STARTER_CATALOG_ACTOR = "system:starter-catalog-seed";
/** Mirrors the catalog contract in the admin API; @suite/db cannot import apps/api. */
export const STARTER_CATALOG_CONTRACT_VERSION = "2026-03" as const;
const STARTER_CATALOG_ITEM_ID_PREFIX = "cmscat_starter_";
export const STARTER_CATALOG_VERSION_NUMBER = 1;

/** Mirrors the production block type registry so a seed cannot declare a type the renderer lacks. */
export const STARTER_SECTION_BLOCK_TYPES = [
  "hero",
  "features",
  "pricing",
  "form",
  "faq",
  "rich-text",
  "navbar",
  "footer",
] as const;

export type StarterSectionBlockType = (typeof STARTER_SECTION_BLOCK_TYPES)[number];

/**
 * Reference `industry_category` codes. The catalog test proves these still
 * exist in the database-owned reference catalog, so the classification cannot
 * drift into an unknown industry (FR-069).
 */
const STARTER_CATALOG_INDUSTRIES = {
  hospitality: "hospitality_lodging",
  restaurant: "restaurant_food_service",
  retail: "retail_ecommerce",
  services: "professional_services",
  wellness: "wellness_fitness_beauty",
} as const;

export const STARTER_APPEARANCE_TOKEN_KEYS = [
  "colorBackground",
  "colorSurface",
  "colorText",
  "colorTextMuted",
  "colorPrimary",
  "colorPrimaryContrast",
  "colorAccent",
  "colorBorder",
  "fontHeading",
  "fontBody",
  "radiusSm",
  "radiusMd",
  "radiusLg",
  "shadowCard",
  "spaceSection",
] as const;

export type StarterAppearanceTokenKey = (typeof STARTER_APPEARANCE_TOKEN_KEYS)[number];

interface StarterLinkTarget {
  url: string;
}

interface StarterNavItem {
  id: string;
  label: string;
  target: StarterLinkTarget;
}

interface StarterFeatureItem {
  id: string;
  title: string;
  description: string;
}

interface StarterPricingFeature {
  text: string;
  included: boolean;
}

interface StarterPricingTier {
  id: string;
  name: string;
  description: string;
  priceAmount: number;
  currency: string;
  interval: "month" | "year" | "one-time";
  cta: { label: string; target: StarterLinkTarget };
  features: StarterPricingFeature[];
  isFeatured?: boolean;
  badge?: string;
}

interface StarterFormField {
  id: string;
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select" | "checkbox";
  placeholder?: string;
  required?: boolean;
}

interface StarterFaqItem {
  id: string;
  question: string;
  answer: string;
}

interface StarterFooterColumn {
  id: string;
  title: string;
  links: { id: string; label: string; target: StarterLinkTarget }[];
}

interface StarterHeroBlock {
  id: string;
  type: "hero";
  props: {
    badge?: string;
    headline: string;
    subheadline?: string;
    primaryCta?: { label: string; target: StarterLinkTarget };
  };
}

interface StarterFeaturesBlock {
  id: string;
  type: "features";
  props: {
    headline?: string;
    subheadline?: string;
    columns?: 2 | 3 | 4;
    features: StarterFeatureItem[];
  };
}

interface StarterPricingBlock {
  id: string;
  type: "pricing";
  props: {
    headline?: string;
    subheadline?: string;
    tiers: StarterPricingTier[];
  };
}

interface StarterFormBlock {
  id: string;
  type: "form";
  props: {
    headline?: string;
    subheadline?: string;
    formId: string;
    submitButtonText?: string;
    successMessage?: string;
    fields: StarterFormField[];
  };
}

interface StarterFaqBlock {
  id: string;
  type: "faq";
  props: {
    headline?: string;
    items: StarterFaqItem[];
  };
}

interface StarterRichTextBlock {
  id: string;
  type: "rich-text";
  props: {
    contentHtml: string;
  };
}

interface StarterNavbarBlock {
  id: string;
  type: "navbar";
  props: {
    logoText?: string;
    items: StarterNavItem[];
    ctaButton?: { label: string; target: StarterLinkTarget };
  };
}

interface StarterFooterBlock {
  id: string;
  type: "footer";
  props: {
    logoText?: string;
    copyrightText?: string;
    columns: StarterFooterColumn[];
  };
}

export type StarterBlock =
  | StarterHeroBlock
  | StarterFeaturesBlock
  | StarterPricingBlock
  | StarterFormBlock
  | StarterFaqBlock
  | StarterRichTextBlock
  | StarterNavbarBlock
  | StarterFooterBlock;

export interface StarterSectionAst {
  id: string;
  name?: string;
  blocks: StarterBlock[];
}

export interface StarterPageAst {
  version: 1;
  schemaVersion: typeof STARTER_CATALOG_CONTRACT_VERSION;
  meta?: { title: string; description?: string };
  sections: StarterSectionAst[];
}

export interface StarterCatalogSectionDefinition {
  schemaVersion: typeof STARTER_CATALOG_CONTRACT_VERSION;
  block: StarterBlock;
}

export interface StarterCatalogTemplateDefinition {
  schemaVersion: typeof STARTER_CATALOG_CONTRACT_VERSION;
  pages: StarterPageAst[];
}

export type StarterCatalogThemeTokens = Record<StarterAppearanceTokenKey, string>;

export interface StarterCatalogThemeDefinition {
  schemaVersion: typeof STARTER_CATALOG_CONTRACT_VERSION;
  tokens: StarterCatalogThemeTokens;
}

interface StarterCatalogItemBase {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly category: string;
  readonly industries: readonly string[];
}

export interface StarterCatalogSectionItem extends StarterCatalogItemBase {
  readonly kind: typeof CmsCatalogKind.SECTION;
  readonly definition: StarterCatalogSectionDefinition;
}

export interface StarterCatalogTemplateItem extends StarterCatalogItemBase {
  readonly kind: typeof CmsCatalogKind.TEMPLATE;
  readonly definition: StarterCatalogTemplateDefinition;
}

export interface StarterCatalogThemeItem extends StarterCatalogItemBase {
  readonly kind: typeof CmsCatalogKind.THEME;
  readonly definition: StarterCatalogThemeDefinition;
}

export type StarterCatalogItem =
  StarterCatalogSectionItem | StarterCatalogTemplateItem | StarterCatalogThemeItem;

export interface StarterCatalogSeed {
  readonly sections: readonly StarterCatalogSectionItem[];
  readonly template: StarterCatalogTemplateItem;
  readonly theme: StarterCatalogThemeItem;
  readonly items: readonly StarterCatalogItem[];
}

const HOME_PATH = "/";
const ABOUT_PATH = "/about";
const CONTACT_PATH = "/contact";
const THEME_NAME = "Warm Terracotta Theme";
const TEMPLATE_NAME = "Business Launch Template";

const SERVICE_INDUSTRIES: readonly string[] = [
  STARTER_CATALOG_INDUSTRIES.hospitality,
  STARTER_CATALOG_INDUSTRIES.restaurant,
  STARTER_CATALOG_INDUSTRIES.retail,
  STARTER_CATALOG_INDUSTRIES.services,
  STARTER_CATALOG_INDUSTRIES.wellness,
];

const COMMERCE_INDUSTRIES: readonly string[] = [
  STARTER_CATALOG_INDUSTRIES.restaurant,
  STARTER_CATALOG_INDUSTRIES.retail,
  STARTER_CATALOG_INDUSTRIES.services,
];

const CONTENT_INDUSTRIES: readonly string[] = [
  STARTER_CATALOG_INDUSTRIES.hospitality,
  STARTER_CATALOG_INDUSTRIES.services,
  STARTER_CATALOG_INDUSTRIES.wellness,
];

/**
 * Canonical DESIGN.md light palette. The database package cannot depend on
 * @suite/website-builder, so the theme carries the same token values a site
 * receives from the appearance defaults; the renderer still validates them.
 */
const STARTER_THEME_TOKENS: StarterCatalogThemeTokens = {
  colorBackground: "#FAF3EF",
  colorSurface: "#FFFFFF",
  colorText: "#1E1B19",
  colorTextMuted: "#6E625D",
  colorPrimary: "#A43A2B",
  colorPrimaryContrast: "#FFFFFF",
  colorAccent: "#0F766E",
  colorBorder: "#E9E2DE",
  fontHeading: "Inter, system-ui, sans-serif",
  fontBody: "Inter, system-ui, sans-serif",
  radiusSm: "0.375rem",
  radiusMd: "0.5rem",
  radiusLg: "0.75rem",
  shadowCard: "0 1px 2px rgba(30, 27, 25, 0.08)",
  spaceSection: "4rem",
};

function heroBlock(): StarterHeroBlock {
  return {
    id: "blk_starter_hero",
    type: "hero",
    props: {
      badge: "Welcome",
      headline: "A website that works as hard as you do",
      subheadline:
        "Introduce your business, explain what makes it different and invite visitors to get in touch.",
      primaryCta: { label: "Get in touch", target: { url: CONTACT_PATH } },
    },
  };
}

function featuresBlock(): StarterFeaturesBlock {
  return {
    id: "blk_starter_features",
    type: "features",
    props: {
      headline: "Why customers choose us",
      subheadline: "Replace these three examples with the strengths that matter to your business.",
      columns: 3,
      features: [
        {
          id: "ftr_starter_quality",
          title: "Dependable quality",
          description: "Describe the standard every customer can expect.",
        },
        {
          id: "ftr_starter_service",
          title: "Personal service",
          description: "Explain how your team looks after each customer.",
        },
        {
          id: "ftr_starter_value",
          title: "Clear value",
          description: "Make the value of choosing you easy to understand.",
        },
      ],
    },
  };
}

function pricingBlock(): StarterPricingBlock {
  return {
    id: "blk_starter_pricing",
    type: "pricing",
    props: {
      headline: "Simple plans",
      subheadline: "Show your packages and let visitors compare them at a glance.",
      tiers: [
        {
          id: "tier_starter_standard",
          name: "Standard",
          description: "The everyday option for most customers.",
          priceAmount: 0,
          currency: "USD",
          interval: "month",
          cta: { label: "Ask about this plan", target: { url: CONTACT_PATH } },
          features: [
            { text: "Core service", included: true },
            { text: "Email support", included: true },
            { text: "Priority booking", included: false },
          ],
        },
        {
          id: "tier_starter_premium",
          name: "Premium",
          description: "The complete option for customers who need more.",
          priceAmount: 0,
          currency: "USD",
          interval: "month",
          isFeatured: true,
          badge: "Recommended",
          cta: { label: "Ask about this plan", target: { url: CONTACT_PATH } },
          features: [
            { text: "Core service", included: true },
            { text: "Email support", included: true },
            { text: "Priority booking", included: true },
          ],
        },
      ],
    },
  };
}

function formBlock(): StarterFormBlock {
  return {
    id: "blk_starter_form",
    type: "form",
    props: {
      headline: "Contact us",
      subheadline: "Tell us what you need and the team will reply within one working day.",
      formId: "starter_contact_form",
      submitButtonText: "Send message",
      successMessage: "Thank you. Your message has been received.",
      fields: [
        {
          id: "fld_starter_name",
          name: "fullName",
          label: "Full name",
          type: "text",
          placeholder: "Your name",
          required: true,
        },
        {
          id: "fld_starter_email",
          name: "email",
          label: "Email address",
          type: "email",
          placeholder: "you@example.com",
          required: true,
        },
        {
          id: "fld_starter_message",
          name: "message",
          label: "Message",
          type: "textarea",
          placeholder: "How can we help?",
          required: true,
        },
      ],
    },
  };
}

function faqBlock(): StarterFaqBlock {
  return {
    id: "blk_starter_faq",
    type: "faq",
    props: {
      headline: "Frequently asked questions",
      items: [
        {
          id: "faq_starter_hours",
          question: "When are you open?",
          answer: "Replace this answer with your opening hours and availability.",
        },
        {
          id: "faq_starter_contact",
          question: "How do I get in touch?",
          answer: "Use the contact form on this page and the team will reply directly.",
        },
      ],
    },
  };
}

function richTextBlock(): StarterRichTextBlock {
  return {
    id: "blk_starter_rich_text",
    type: "rich-text",
    props: {
      contentHtml:
        "<h2>Tell your story</h2><p>Use this space to explain who you are, how you started and what visitors should know before they contact you.</p>",
    },
  };
}

function navbarBlock(): StarterNavbarBlock {
  return {
    id: "blk_starter_navbar",
    type: "navbar",
    props: {
      logoText: "Business OS",
      items: [
        { id: "nav_starter_home", label: "Home", target: { url: HOME_PATH } },
        { id: "nav_starter_about", label: "About", target: { url: ABOUT_PATH } },
        { id: "nav_starter_contact", label: "Contact", target: { url: CONTACT_PATH } },
      ],
      ctaButton: { label: "Contact", target: { url: CONTACT_PATH } },
    },
  };
}

function footerBlock(): StarterFooterBlock {
  return {
    id: "blk_starter_footer",
    type: "footer",
    props: {
      logoText: "Business OS",
      copyrightText: "© Business OS. All rights reserved.",
      columns: [
        {
          id: "ftr_col_starter_explore",
          title: "Explore",
          links: [
            { id: "ftr_link_starter_home", label: "Home", target: { url: HOME_PATH } },
            { id: "ftr_link_starter_about", label: "About", target: { url: ABOUT_PATH } },
            { id: "ftr_link_starter_contact", label: "Contact", target: { url: CONTACT_PATH } },
          ],
        },
      ],
    },
  };
}

function heroSectionDefinition(): StarterCatalogSectionDefinition {
  return { schemaVersion: STARTER_CATALOG_CONTRACT_VERSION, block: heroBlock() };
}

function featuresSectionDefinition(): StarterCatalogSectionDefinition {
  return { schemaVersion: STARTER_CATALOG_CONTRACT_VERSION, block: featuresBlock() };
}

function pricingSectionDefinition(): StarterCatalogSectionDefinition {
  return { schemaVersion: STARTER_CATALOG_CONTRACT_VERSION, block: pricingBlock() };
}

function formSectionDefinition(): StarterCatalogSectionDefinition {
  return { schemaVersion: STARTER_CATALOG_CONTRACT_VERSION, block: formBlock() };
}

function faqSectionDefinition(): StarterCatalogSectionDefinition {
  return { schemaVersion: STARTER_CATALOG_CONTRACT_VERSION, block: faqBlock() };
}

function richTextSectionDefinition(): StarterCatalogSectionDefinition {
  return { schemaVersion: STARTER_CATALOG_CONTRACT_VERSION, block: richTextBlock() };
}

function navbarSectionDefinition(): StarterCatalogSectionDefinition {
  return { schemaVersion: STARTER_CATALOG_CONTRACT_VERSION, block: navbarBlock() };
}

function footerSectionDefinition(): StarterCatalogSectionDefinition {
  return { schemaVersion: STARTER_CATALOG_CONTRACT_VERSION, block: footerBlock() };
}

interface SectionItemInput {
  readonly slug: string;
  readonly name: string;
  readonly category: string;
  readonly industries: readonly string[];
  readonly definition: StarterCatalogSectionDefinition;
}

function sectionItem(input: SectionItemInput): StarterCatalogSectionItem {
  return {
    kind: CmsCatalogKind.SECTION,
    id: starterCatalogItemId(input.slug),
    name: input.name,
    slug: input.slug,
    category: input.category,
    industries: input.industries,
    definition: input.definition,
  };
}

function buildSections(): readonly StarterCatalogSectionItem[] {
  return [
    sectionItem({
      slug: "hero-banner",
      name: "Hero Banner",
      category: "marketing",
      industries: SERVICE_INDUSTRIES,
      definition: heroSectionDefinition(),
    }),
    sectionItem({
      slug: "feature-grid",
      name: "Feature Grid",
      category: "marketing",
      industries: SERVICE_INDUSTRIES,
      definition: featuresSectionDefinition(),
    }),
    sectionItem({
      slug: "pricing-table",
      name: "Pricing Table",
      category: "commerce",
      industries: COMMERCE_INDUSTRIES,
      definition: pricingSectionDefinition(),
    }),
    sectionItem({
      slug: "faq-accordion",
      name: "FAQ Accordion",
      category: "content",
      industries: CONTENT_INDUSTRIES,
      definition: faqSectionDefinition(),
    }),
    sectionItem({
      slug: "rich-text-article",
      name: "Rich Text Article",
      category: "content",
      industries: CONTENT_INDUSTRIES,
      definition: richTextSectionDefinition(),
    }),
    sectionItem({
      slug: "navigation-header",
      name: "Navigation Header",
      category: "navigation",
      industries: SERVICE_INDUSTRIES,
      definition: navbarSectionDefinition(),
    }),
    sectionItem({
      slug: "footer-navigation",
      name: "Footer Navigation",
      category: "navigation",
      industries: SERVICE_INDUSTRIES,
      definition: footerSectionDefinition(),
    }),
    sectionItem({
      slug: "contact-form",
      name: "Contact Form",
      category: "marketing",
      industries: SERVICE_INDUSTRIES,
      definition: formSectionDefinition(),
    }),
  ];
}

function templatePage(
  title: string,
  description: string,
  sections: StarterSectionAst[],
): StarterPageAst {
  return {
    version: 1,
    schemaVersion: STARTER_CATALOG_CONTRACT_VERSION,
    meta: { title, description },
    sections,
  };
}

function templateHomePage(): StarterPageAst {
  return templatePage("Home", "The template landing page.", [
    { id: "sec_template_home_nav", name: "Navigation", blocks: [navbarBlock()] },
    { id: "sec_template_home_hero", name: "Hero", blocks: [heroBlock()] },
    { id: "sec_template_home_features", name: "Features", blocks: [featuresBlock()] },
    { id: "sec_template_home_story", name: "Story", blocks: [richTextBlock()] },
    { id: "sec_template_home_faq", name: "FAQ", blocks: [faqBlock()] },
    { id: "sec_template_home_footer", name: "Footer", blocks: [footerBlock()] },
  ]);
}

function templateAboutPage(): StarterPageAst {
  return templatePage("About", "An about page for the business story.", [
    { id: "sec_template_about_nav", name: "Navigation", blocks: [navbarBlock()] },
    { id: "sec_template_about_story", name: "Story", blocks: [richTextBlock()] },
    { id: "sec_template_about_footer", name: "Footer", blocks: [footerBlock()] },
  ]);
}

function templateContactPage(): StarterPageAst {
  return templatePage("Contact", "A contact page with a lead form.", [
    { id: "sec_template_contact_nav", name: "Navigation", blocks: [navbarBlock()] },
    { id: "sec_template_contact_form", name: "Contact form", blocks: [formBlock()] },
    { id: "sec_template_contact_footer", name: "Footer", blocks: [footerBlock()] },
  ]);
}

function buildTemplateItem(): StarterCatalogTemplateItem {
  const slug = "business-launch-template";
  return {
    kind: CmsCatalogKind.TEMPLATE,
    id: starterCatalogItemId(slug),
    name: TEMPLATE_NAME,
    slug,
    category: "launch",
    industries: SERVICE_INDUSTRIES,
    definition: {
      schemaVersion: STARTER_CATALOG_CONTRACT_VERSION,
      pages: [templateHomePage(), templateAboutPage(), templateContactPage()],
    },
  };
}

function buildThemeItem(): StarterCatalogThemeItem {
  const slug = "warm-terracotta-theme";
  return {
    kind: CmsCatalogKind.THEME,
    id: starterCatalogItemId(slug),
    name: THEME_NAME,
    slug,
    category: "brand",
    industries: SERVICE_INDUSTRIES,
    definition: {
      schemaVersion: STARTER_CATALOG_CONTRACT_VERSION,
      tokens: STARTER_THEME_TOKENS,
    },
  };
}

/**
 * The deterministic starter catalog: eight sections, one template and one
 * theme. Calling it twice returns equal data, so the seed can diff safely.
 */
export function buildStarterCatalogSeed(): StarterCatalogSeed {
  const sections = buildSections();
  const template = buildTemplateItem();
  const theme = buildThemeItem();
  return {
    sections,
    template,
    theme,
    items: [...sections, template, theme],
  };
}

/** Stable primary key for a seeded item, derived from its catalog slug. */
export function starterCatalogItemId(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(normalized)) {
    throw new Error('The starter catalog slug "' + slug + '" is not a lower-case catalog slug.');
  }
  return STARTER_CATALOG_ITEM_ID_PREFIX + normalized.replaceAll("-", "_");
}

/** Stable primary key for the first published version of a seeded item. */
export function starterCatalogVersionId(slug: string): string {
  return starterCatalogItemId(slug) + "_v" + String(STARTER_CATALOG_VERSION_NUMBER);
}
