import React from "react";
import type { SectionAst, BlockAst } from "../ast/types.js";
import {
  HeroBlock,
  FeaturesBlock,
  PricingBlock,
  FormBlock,
  FaqBlock,
  RichTextBlock,
  NavbarBlock,
  FooterBlock,
} from "../components/blocks/index.js";

export interface SectionRendererProps {
  section: SectionAst;
  isEditor?: boolean;
}

// ---------------------------------------------------------------------------
// Block Renderer Dispatch Table
// ---------------------------------------------------------------------------

type BlockRendererFn = (block: BlockAst) => React.ReactNode;

const BLOCK_COMPONENTS: Record<string, BlockRendererFn> = {
  hero: (block) => {
    const b = block as Extract<BlockAst, { type: "hero" }>;
    return <HeroBlock key={b.id} props={b.props} styles={b.styles} />;
  },
  features: (block) => {
    const b = block as Extract<BlockAst, { type: "features" }>;
    return <FeaturesBlock key={b.id} props={b.props} styles={b.styles} />;
  },
  pricing: (block) => {
    const b = block as Extract<BlockAst, { type: "pricing" }>;
    return <PricingBlock key={b.id} props={b.props} styles={b.styles} />;
  },
  form: (block) => {
    const b = block as Extract<BlockAst, { type: "form" }>;
    return <FormBlock key={b.id} props={b.props} styles={b.styles} />;
  },
  faq: (block) => {
    const b = block as Extract<BlockAst, { type: "faq" }>;
    return <FaqBlock key={b.id} props={b.props} styles={b.styles} />;
  },
  "rich-text": (block) => {
    const b = block as Extract<BlockAst, { type: "rich-text" }>;
    return <RichTextBlock key={b.id} props={b.props} styles={b.styles} />;
  },
  navbar: (block) => {
    const b = block as Extract<BlockAst, { type: "navbar" }>;
    return <NavbarBlock key={b.id} props={b.props} styles={b.styles} />;
  },
  footer: (block) => {
    const b = block as Extract<BlockAst, { type: "footer" }>;
    return <FooterBlock key={b.id} props={b.props} styles={b.styles} />;
  },
};

// ---------------------------------------------------------------------------
// Section Layout Configuration Maps
// ---------------------------------------------------------------------------

const MAX_WIDTH_CLASS_MAP: Record<NonNullable<SectionAst["styles"]>["maxWidth"] & string, string> = {
  sm: "max-w-screen-sm",
  md: "max-w-screen-md",
  lg: "max-w-screen-lg",
  xl: "max-w-screen-xl",
  "2xl": "max-w-screen-2xl",
  full: "max-w-full",
};

export function renderBlockComponent(block: BlockAst, isEditor?: boolean): React.ReactNode {
  const renderer = BLOCK_COMPONENTS[block.type];
  if (renderer) {
    return renderer(block);
  }

  if (isEditor) {
    const unknownBlock = block as { id?: string; type?: string };
    return (
      <div
        key={unknownBlock.id || "unknown"}
        className="p-4 my-2 border-2 border-dashed border-amber-400 bg-amber-50 text-amber-800 text-sm rounded-lg"
      >
        Unsupported or custom block type: {unknownBlock.type || "unknown"}
      </div>
    );
  }

  return null;
}

export function SectionRenderer({ section, isEditor = false }: SectionRendererProps) {
  const { visibility, styles, blocks } = section;

  // Responsive visibility utility classes
  const visibilityClasses = [
    visibility?.hideOnMobile ? "hidden sm:block" : "",
    visibility?.hideOnTablet ? "sm:hidden md:block" : "",
    visibility?.hideOnDesktop ? "lg:hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Container max-width mapped from dictionary table
  const maxWidthClass = (styles?.maxWidth && MAX_WIDTH_CLASS_MAP[styles.maxWidth]) || "max-w-full";

  const sectionStyle: React.CSSProperties = {
    backgroundColor: styles?.backgroundColor,
    backgroundImage: styles?.backgroundImageUrl ? `url(${styles.backgroundImageUrl})` : undefined,
    backgroundRepeat: styles?.backgroundRepeat || "no-repeat",
    backgroundSize: styles?.backgroundSize || "cover",
    paddingTop: styles?.paddingTop !== undefined ? `${styles.paddingTop}px` : undefined,
    paddingBottom: styles?.paddingBottom !== undefined ? `${styles.paddingBottom}px` : undefined,
  };

  return (
    <section
      id={section.id}
      data-section-id={section.id}
      style={sectionStyle}
      className={`relative w-full ${visibilityClasses} ${styles?.customClassName || ""}`}
    >
      {styles?.backgroundOverlayColor ? (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundColor: styles.backgroundOverlayColor }}
        />
      ) : null}

      <div className={`relative mx-auto w-full ${maxWidthClass}`}>
        {blocks.map((block) => renderBlockComponent(block, isEditor))}
      </div>
    </section>
  );
}
