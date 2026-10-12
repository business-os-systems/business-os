import React from "react";
import { Input, Textarea } from "@suite/ui";
import { LinkTargetConfigurator } from "./link-target-configurator.js";
import type { BlockAst, LinkTarget } from "../../ast/types.js";

export type BlockPropUpdater = (updatedProps: Record<string, unknown>) => void;

interface BlockPropsEditorProps<T = Record<string, unknown>> {
  props: T;
  onChange: BlockPropUpdater;
}

// ---------------------------------------------------------------------------
// 1. Hero Block Form
// ---------------------------------------------------------------------------
function HeroPropsEditor({ props, onChange }: BlockPropsEditorProps<{
  badge?: string;
  headline?: string;
  subheadline?: string;
  primaryCta?: { label: string; target: LinkTarget };
  secondaryCta?: { label: string; target: LinkTarget };
}>) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Badge Tag</label>
        <Input
          type="text"
          value={props.badge || ""}
          onChange={(e) => onChange({ ...props, badge: e.target.value })}
          placeholder="e.g. New Release"
          className="h-8 text-xs"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Headline</label>
        <Input
          type="text"
          value={props.headline || ""}
          onChange={(e) => onChange({ ...props, headline: e.target.value })}
          placeholder="Main heading"
          className="h-8 text-xs font-semibold"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Subheadline</label>
        <Textarea
          value={props.subheadline || ""}
          onChange={(e) => onChange({ ...props, subheadline: e.target.value })}
          placeholder="Supporting narrative"
          className="text-xs"
          rows={3}
        />
      </div>

      <LinkTargetConfigurator
        label="Primary Call To Action"
        target={props.primaryCta?.target}
        onChange={(target) =>
          onChange({
            ...props,
            primaryCta: {
              label: props.primaryCta?.label || "Learn More",
              target,
            },
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Features Block Form
// ---------------------------------------------------------------------------
function FeaturesPropsEditor({ props, onChange }: BlockPropsEditorProps<{
  headline?: string;
  subheadline?: string;
}>) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Section Headline</label>
        <Input
          type="text"
          value={props.headline || ""}
          onChange={(e) => onChange({ ...props, headline: e.target.value })}
          placeholder="Features headline"
          className="h-8 text-xs"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Section Subheadline</label>
        <Textarea
          value={props.subheadline || ""}
          onChange={(e) => onChange({ ...props, subheadline: e.target.value })}
          placeholder="Why choose our solution"
          className="text-xs"
          rows={2}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Pricing Block Form
// ---------------------------------------------------------------------------
function PricingPropsEditor({ props, onChange }: BlockPropsEditorProps<{
  headline?: string;
  subheadline?: string;
}>) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Pricing Headline</label>
        <Input
          type="text"
          value={props.headline || ""}
          onChange={(e) => onChange({ ...props, headline: e.target.value })}
          placeholder="Transparent pricing"
          className="h-8 text-xs"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Pricing Subheadline</label>
        <Textarea
          value={props.subheadline || ""}
          onChange={(e) => onChange({ ...props, subheadline: e.target.value })}
          placeholder="Choose the plan that suits you"
          className="text-xs"
          rows={2}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Contact / Form Block Form
// ---------------------------------------------------------------------------
function FormPropsEditor({ props, onChange }: BlockPropsEditorProps<{
  headline?: string;
  subheadline?: string;
  submitButtonText?: string;
}>) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Form Headline</label>
        <Input
          type="text"
          value={props.headline || ""}
          onChange={(e) => onChange({ ...props, headline: e.target.value })}
          placeholder="Get in touch"
          className="h-8 text-xs"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Submit Button Label</label>
        <Input
          type="text"
          value={props.submitButtonText || "Send Message"}
          onChange={(e) => onChange({ ...props, submitButtonText: e.target.value })}
          placeholder="Send Message"
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. FAQ Block Form
// ---------------------------------------------------------------------------
function FaqPropsEditor({ props, onChange }: BlockPropsEditorProps<{
  headline?: string;
  subheadline?: string;
}>) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">FAQ Headline</label>
        <Input
          type="text"
          value={props.headline || ""}
          onChange={(e) => onChange({ ...props, headline: e.target.value })}
          placeholder="Frequently Asked Questions"
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Rich Text Block Form
// ---------------------------------------------------------------------------
function RichTextPropsEditor({ props, onChange }: BlockPropsEditorProps<{
  contentHtml?: string;
}>) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">HTML Content</label>
        <Textarea
          value={props.contentHtml || ""}
          onChange={(e) => onChange({ ...props, contentHtml: e.target.value })}
          placeholder="<p>Write your article copy here...</p>"
          className="text-xs font-mono"
          rows={6}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7. Navbar Block Form
// ---------------------------------------------------------------------------
function NavbarPropsEditor({ props, onChange }: BlockPropsEditorProps<{
  logoText?: string;
  logoUrl?: string;
}>) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Logo Brand Text</label>
        <Input
          type="text"
          value={props.logoText || ""}
          onChange={(e) => onChange({ ...props, logoText: e.target.value })}
          placeholder="Brand Name"
          className="h-8 text-xs font-semibold"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Logo Image URL</label>
        <Input
          type="text"
          value={props.logoUrl || ""}
          onChange={(e) => onChange({ ...props, logoUrl: e.target.value })}
          placeholder="https://cdn.example.com/logo.svg"
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. Footer Block Form
// ---------------------------------------------------------------------------
function FooterPropsEditor({ props, onChange }: BlockPropsEditorProps<{
  logoText?: string;
  copyrightText?: string;
}>) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Brand Name</label>
        <Input
          type="text"
          value={props.logoText || ""}
          onChange={(e) => onChange({ ...props, logoText: e.target.value })}
          placeholder="Brand Name"
          className="h-8 text-xs"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Copyright Notice</label>
        <Input
          type="text"
          value={props.copyrightText || ""}
          onChange={(e) => onChange({ ...props, copyrightText: e.target.value })}
          placeholder="© 2026 Business OS. All rights reserved."
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block Form Dispatch Table
// ---------------------------------------------------------------------------
type BlockFormRenderer = (
  props: Record<string, unknown>,
  onChange: BlockPropUpdater
) => React.ReactNode;

export const BLOCK_FORM_REGISTRY: Record<string, BlockFormRenderer> = {
  hero: (props, onChange) => <HeroPropsEditor props={props} onChange={onChange} />,
  features: (props, onChange) => <FeaturesPropsEditor props={props} onChange={onChange} />,
  pricing: (props, onChange) => <PricingPropsEditor props={props} onChange={onChange} />,
  form: (props, onChange) => <FormPropsEditor props={props} onChange={onChange} />,
  faq: (props, onChange) => <FaqPropsEditor props={props} onChange={onChange} />,
  "rich-text": (props, onChange) => <RichTextPropsEditor props={props} onChange={onChange} />,
  navbar: (props, onChange) => <NavbarPropsEditor props={props} onChange={onChange} />,
  footer: (props, onChange) => <FooterPropsEditor props={props} onChange={onChange} />,
};

export function renderBlockPropertiesForm(
  block: BlockAst,
  onChange: BlockPropUpdater
): React.ReactNode {
  const formRenderer = BLOCK_FORM_REGISTRY[block.type];
  if (formRenderer) {
    return formRenderer(block.props as unknown as Record<string, unknown>, onChange);
  }

  return (
    <div className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded">
      No specialized property editors configured for {block.type}.
    </div>
  );
}
