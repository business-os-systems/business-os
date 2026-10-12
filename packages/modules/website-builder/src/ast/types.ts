/**
 * Abstract Syntax Tree (AST) Data Types & Component Specifications
 * for Website Builder & Headless CMS (@suite/website-builder)
 */

export type ResponsiveDevice = "mobile" | "tablet" | "desktop";

export interface ResponsiveVisibility {
  hideOnMobile?: boolean;
  hideOnTablet?: boolean;
  hideOnDesktop?: boolean;
}

export interface BlockStyleTokens {
  backgroundColor?: string;
  textColor?: string;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  marginTop?: number;
  marginBottom?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  textAlign?: "left" | "center" | "right" | "justify";
  customClassName?: string;
}

export interface SectionStyleTokens extends BlockStyleTokens {
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  backgroundImageUrl?: string;
  backgroundOverlayColor?: string;
  backgroundRepeat?: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
  backgroundSize?: "cover" | "contain" | "auto";
}

export interface LinkTarget {
  url: string;
  isExternal?: boolean;
  openInNewTab?: boolean;
  rel?: string;
}

// 1. Hero Block Props
export interface HeroBlockProps {
  badge?: string;
  headline: string;
  subheadline?: string;
  primaryCta?: {
    label: string;
    target: LinkTarget;
  };
  secondaryCta?: {
    label: string;
    target: LinkTarget;
  };
  imageUrl?: string;
  imageAlt?: string;
  imagePosition?: "right" | "left" | "bottom" | "background";
}

// 2. Features Grid Block Props
export interface FeatureItem {
  id: string;
  iconName?: string;
  title: string;
  description: string;
  link?: LinkTarget;
}

export interface FeaturesBlockProps {
  headline?: string;
  subheadline?: string;
  columns?: 2 | 3 | 4;
  features: FeatureItem[];
}

// 3. Pricing Table Block Props
export interface PricingTierFeature {
  text: string;
  included: boolean;
}

export interface PricingTierItem {
  id: string;
  name: string;
  description?: string;
  priceAmount: number;
  currency: string;
  interval: "month" | "year" | "one-time";
  isFeatured?: boolean;
  badge?: string;
  cta: {
    label: string;
    target: LinkTarget;
  };
  features: PricingTierFeature[];
}

export interface PricingBlockProps {
  headline?: string;
  subheadline?: string;
  tiers: PricingTierItem[];
}

// 4. Contact / Lead Form Block Props
export interface FormFieldItem {
  id: string;
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select" | "checkbox";
  placeholder?: string;
  required?: boolean;
  options?: string[]; // for select
}

export interface FormBlockProps {
  headline?: string;
  subheadline?: string;
  formId: string;
  submitButtonText?: string;
  successMessage?: string;
  errorMessage?: string;
  fields: FormFieldItem[];
}

// 5. FAQ Accordion Block Props
export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface FaqBlockProps {
  headline?: string;
  subheadline?: string;
  items: FaqItem[];
}

// 6. Rich Text Block Props
export interface RichTextBlockProps {
  contentHtml: string;
}

// 7. Navbar Block Props
export interface NavItem {
  id: string;
  label: string;
  target: LinkTarget;
  children?: NavItem[];
}

export interface NavbarBlockProps {
  logoUrl?: string;
  logoText?: string;
  items: NavItem[];
  ctaButton?: {
    label: string;
    target: LinkTarget;
  };
}

// 8. Footer Block Props
export interface FooterColumn {
  id: string;
  title: string;
  links: Array<{ id: string; label: string; target: LinkTarget }>;
}

export interface FooterBlockProps {
  logoUrl?: string;
  logoText?: string;
  copyrightText?: string;
  columns: FooterColumn[];
  socialLinks?: Array<{
    platform: "twitter" | "facebook" | "instagram" | "linkedin" | "github";
    url: string;
  }>;
}

// Discriminated Block AST Types
export type BlockType =
  | "hero"
  | "features"
  | "pricing"
  | "form"
  | "faq"
  | "rich-text"
  | "navbar"
  | "footer";

export interface HeroBlockAst {
  id: string;
  type: "hero";
  props: HeroBlockProps;
  styles?: BlockStyleTokens;
}

export interface FeaturesBlockAst {
  id: string;
  type: "features";
  props: FeaturesBlockProps;
  styles?: BlockStyleTokens;
}

export interface PricingBlockAst {
  id: string;
  type: "pricing";
  props: PricingBlockProps;
  styles?: BlockStyleTokens;
}

export interface FormBlockAst {
  id: string;
  type: "form";
  props: FormBlockProps;
  styles?: BlockStyleTokens;
}

export interface FaqBlockAst {
  id: string;
  type: "faq";
  props: FaqBlockProps;
  styles?: BlockStyleTokens;
}

export interface RichTextBlockAst {
  id: string;
  type: "rich-text";
  props: RichTextBlockProps;
  styles?: BlockStyleTokens;
}

export interface NavbarBlockAst {
  id: string;
  type: "navbar";
  props: NavbarBlockProps;
  styles?: BlockStyleTokens;
}

export interface FooterBlockAst {
  id: string;
  type: "footer";
  props: FooterBlockProps;
  styles?: BlockStyleTokens;
}

export type BlockAst =
  | HeroBlockAst
  | FeaturesBlockAst
  | PricingBlockAst
  | FormBlockAst
  | FaqBlockAst
  | RichTextBlockAst
  | NavbarBlockAst
  | FooterBlockAst;

// Section AST
export interface SectionAst {
  id: string;
  name?: string;
  visibility?: ResponsiveVisibility;
  styles?: SectionStyleTokens;
  blocks: BlockAst[];
}

// Page AST (Root)
export interface PageAst {
  version: 1;
  schemaVersion: "2026-03";
  meta?: {
    title?: string;
    description?: string;
    keywords?: string[];
    ogImageUrl?: string;
  };
  globalStyles?: {
    fontFamily?: string;
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
  };
  sections: SectionAst[];
}
