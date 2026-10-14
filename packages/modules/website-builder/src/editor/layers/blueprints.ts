import type { BlockType } from "../../ast/types.js";
import type { BlockBlueprint } from "./types.js";

export const BLOCK_BLUEPRINTS: Record<BlockType, BlockBlueprint> = {
  hero: {
    type: "hero",
    title: "Hero Banner",
    description: "High-impact opening headline, subheadline, and primary call-to-action button.",
    category: "marketing",
    createDefaultBlock: (id: string) => ({
      id,
      type: "hero",
      props: {
        badge: "Announcement",
        headline: "Engaging Headline Goes Here",
        subheadline: "Provide a concise summary of your service or value proposition.",
        primaryCta: {
          label: "Call to Action",
          target: { url: "#" },
        },
      },
      styles: {
        paddingTop: 64,
        paddingBottom: 64,
        textAlign: "center",
      },
    }),
  },
  features: {
    type: "features",
    title: "Feature Grid",
    description: "Multi-column grid showcasing product capabilities with icons and summaries.",
    category: "marketing",
    createDefaultBlock: (id: string) => ({
      id,
      type: "features",
      props: {
        headline: "Key Capabilities",
        subheadline: "Highlight core benefits and operational strengths.",
        columns: 3,
        features: [
          { id: `${id}_f1`, title: "Feature One", description: "Clear explanation of the first capability." },
          { id: `${id}_f2`, title: "Feature Two", description: "Clear explanation of the second capability." },
          { id: `${id}_f3`, title: "Feature Three", description: "Clear explanation of the third capability." },
        ],
      },
      styles: {
        paddingTop: 48,
        paddingBottom: 48,
      },
    }),
  },
  pricing: {
    type: "pricing",
    title: "Pricing Table",
    description: "Tiered subscription and pricing plans with feature comparison checklists.",
    category: "commerce",
    createDefaultBlock: (id: string) => ({
      id,
      type: "pricing",
      props: {
        headline: "Transparent Plans",
        subheadline: "Select the option that matches your operational requirements.",
        tiers: [
          {
            id: `${id}_t1`,
            name: "Standard",
            priceAmount: 0,
            currency: "USD",
            interval: "month",
            cta: { label: "Get Started", target: { url: "#" } },
            features: [
              { text: "Included Feature A", included: true },
              { text: "Included Feature B", included: true },
              { text: "Optional Feature C", included: false },
            ],
          },
          {
            id: `${id}_t2`,
            name: "Premium",
            priceAmount: 0,
            currency: "USD",
            interval: "month",
            isFeatured: true,
            badge: "Recommended",
            cta: { label: "Contact Us", target: { url: "#" } },
            features: [
              { text: "Included Feature A", included: true },
              { text: "Included Feature B", included: true },
              { text: "Included Feature C", included: true },
            ],
          },
        ],
      },
      styles: {
        paddingTop: 48,
        paddingBottom: 48,
      },
    }),
  },
  form: {
    type: "form",
    title: "Lead Capture Form",
    description: "Customizable contact form with anti-spam and instant CRM lead ingestion.",
    category: "marketing",
    createDefaultBlock: (id: string) => ({
      id,
      type: "form",
      props: {
        headline: "Get in Touch",
        subheadline: "Our team will respond within 24 hours.",
        formId: "contact_inquiry_form",
        submitButtonText: "Submit Inquiry",
        fields: [
          { id: `${id}_fld1`, name: "fullName", label: "Full Name", type: "text", required: true },
          { id: `${id}_fld2`, name: "email", label: "Work Email", type: "email", required: true },
          { id: `${id}_fld3`, name: "message", label: "Message", type: "textarea", required: true },
        ],
      },
      styles: {
        paddingTop: 40,
        paddingBottom: 40,
      },
    }),
  },
  faq: {
    type: "faq",
    title: "FAQ Accordion",
    description: "Collapsible questions and answers addressing customer inquiries.",
    category: "content",
    createDefaultBlock: (id: string) => ({
      id,
      type: "faq",
      props: {
        headline: "Common Questions",
        items: [
          {
            id: `${id}_q1`,
            question: "Question one headline",
            answer: "Comprehensive answer addressing customer inquiry.",
          },
          {
            id: `${id}_q2`,
            question: "Question two headline",
            answer: "Comprehensive answer addressing customer inquiry.",
          },
        ],
      },
      styles: {
        paddingTop: 40,
        paddingBottom: 40,
      },
    }),
  },
  "rich-text": {
    type: "rich-text",
    title: "Rich Text Article",
    description: "Long-form editorial content, headings, paragraphs, and formatted prose.",
    category: "content",
    createDefaultBlock: (id: string) => ({
      id,
      type: "rich-text",
      props: {
        contentHtml: "<h2>Article Heading</h2><p>Enter descriptive editorial content and paragraphs here.</p>",
      },
      styles: {
        paddingTop: 32,
        paddingBottom: 32,
      },
    }),
  },
  navbar: {
    type: "navbar",
    title: "Navigation Header",
    description: "Top navigation bar with logo branding, menu links, and primary action button.",
    category: "navigation",
    createDefaultBlock: (id: string) => ({
      id,
      type: "navbar",
      props: {
        logoText: "Brand",
        items: [
          { id: `${id}_n1`, label: "Home", target: { url: "/" } },
          { id: `${id}_n2`, label: "About", target: { url: "/about" } },
        ],
        ctaButton: {
          label: "Contact",
          target: { url: "/contact" },
        },
      },
      styles: {
        paddingTop: 16,
        paddingBottom: 16,
      },
    }),
  },
  footer: {
    type: "footer",
    title: "Footer Navigation",
    description: "Page footer with multi-column links, copyright notice, and social connections.",
    category: "navigation",
    createDefaultBlock: (id: string) => ({
      id,
      type: "footer",
      props: {
        logoText: "Brand",
        copyrightText: "© All rights reserved.",
        columns: [
          {
            id: `${id}_c1`,
            title: "Navigation",
            links: [
              { id: `${id}_l1`, label: "Home", target: { url: "/" } },
              { id: `${id}_l2`, label: "Contact", target: { url: "/contact" } },
            ],
          },
        ],
      },
      styles: {
        paddingTop: 48,
        paddingBottom: 48,
      },
    }),
  },
};
