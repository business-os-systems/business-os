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
        badge: "Welcome",
        headline: "Transform Your Business with Composable OS",
        subheadline: "Empowering modern enterprises with modular speed and edge delivery.",
        primaryCta: {
          label: "Get Started Free",
          target: { url: "/signup" },
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
        headline: "Powerful Core Features",
        subheadline: "Engineered from the ground up for maximum reliability.",
        columns: 3,
        features: [
          { id: `${id}_f1`, title: "Lightning Fast", description: "Edge-cached delivery under 50ms globally." },
          { id: `${id}_f2`, title: "Multi-Tenant Safe", description: "Row-level database kernel isolation." },
          { id: `${id}_f3`, title: "Headless Extensible", description: "Full REST & GraphQL headless publishing API." },
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
        headline: "Simple, Predictable Pricing",
        subheadline: "No hidden fees. Scale as your business grows.",
        tiers: [
          {
            id: `${id}_t1`,
            name: "Starter",
            priceAmount: 49,
            currency: "USD",
            interval: "month",
            cta: { label: "Start Free Trial", target: { url: "/signup?plan=starter" } },
            features: [
              { text: "Up to 5 Team Members", included: true },
              { text: "Unlimited CMS Pages", included: true },
              { text: "Custom Domain Support", included: false },
            ],
          },
          {
            id: `${id}_t2`,
            name: "Enterprise",
            priceAmount: 199,
            currency: "USD",
            interval: "month",
            isFeatured: true,
            badge: "Most Popular",
            cta: { label: "Upgrade Now", target: { url: "/signup?plan=pro" } },
            features: [
              { text: "Unlimited Team Members", included: true },
              { text: "Priority Edge Delivery", included: true },
              { text: "Dedicated 24/7 Support", included: true },
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
        headline: "Frequently Asked Questions",
        items: [
          {
            id: `${id}_q1`,
            question: "How does the composable architecture work?",
            answer: "Each business application operates independently while sharing the core database kernel and authentication layer.",
          },
          {
            id: `${id}_q2`,
            question: "Can I connect custom domains?",
            answer: "Yes, custom domains can be attached with automatic SSL certification at edge CDN edges.",
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
        contentHtml: "<h2>Editorial Insights</h2><p>Deliver rich editorial storytelling with seamless CMS integrations.</p>",
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
        logoText: "Business OS",
        items: [
          { id: `${id}_n1`, label: "Products", target: { url: "/products" } },
          { id: `${id}_n2`, label: "Pricing", target: { url: "/pricing" } },
          { id: `${id}_n3`, label: "Docs", target: { url: "/docs" } },
        ],
        ctaButton: {
          label: "Dashboard",
          target: { url: "/dashboard" },
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
        logoText: "Business OS",
        copyrightText: `© ${new Date().getFullYear()} Business OS. All rights reserved.`,
        columns: [
          {
            id: `${id}_c1`,
            title: "Product",
            links: [
              { id: `${id}_l1`, label: "Features", target: { url: "/features" } },
              { id: `${id}_l2`, label: "Roadmap", target: { url: "/roadmap" } },
            ],
          },
          {
            id: `${id}_c2`,
            title: "Legal",
            links: [
              { id: `${id}_l3`, label: "Privacy Policy", target: { url: "/privacy" } },
              { id: `${id}_l4`, label: "Terms of Service", target: { url: "/terms" } },
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
